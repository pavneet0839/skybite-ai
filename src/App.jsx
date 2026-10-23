import { useEffect, useRef, useState } from 'react'
import PassengerMealSelector from './components/PassengerMealSelector.jsx'
import CrewSeatMap from './components/CrewSeatMap.jsx'
import CateringPriorityQueue from './components/CateringPriorityQueue.jsx'
import FlightPathBackground from './components/FlightPathBackground.jsx'
import MealExchange from './components/MealExchange.jsx'
import { meals, supportedAllergens } from './data/meals.js'
import {
  createDefaultAppData,
  createFirstTimePassengerDemoData,
  loadAppData,
  saveAppData,
} from './data/appPersistence.js'
import './App.css'

const URGENT_WINDOW_MS = 60 * 60 * 1000
const LATE_MEAL_MESSAGE =
  'Your meal change request was received too close to departure. The catering cutoff for new meal requests has passed, so we cannot confirm that a new meal can be prepared and delivered in time. Your existing meal selection remains unchanged. If you are already at the airport, please speak to gate staff to ask whether a suitable meal is available. If you have an allergy or an essential dietary requirement, please inform staff directly.'

function getMealName(mealId) {
  return meals.find((meal) => meal.id === mealId)?.name ?? mealId ?? ''
}

function getAllergyDescription(passenger) {
  const supported = (passenger.allergies ?? []).map(
    (id) => supportedAllergens.find((allergen) => allergen.id === id)?.label ?? id,
  )
  const custom = passenger.customAllergy?.trim()

  return [...supported, ...(custom ? [custom] : [])].join(', ')
}

const NAVIGATION = {
  Passenger: [
    { id: 'dashboard', label: 'Dashboard', icon: '◫' },
    { id: 'passengers', label: 'Passengers', icon: '◎' },
    { id: 'exchange', label: 'Meal Exchange', icon: '⇄' },
  ],
  'Cabin Crew': [
    { id: 'dashboard', label: 'Dashboard', icon: '◫' },
    { id: 'passengers', label: 'Passengers', icon: '◎' },
    { id: 'crew', label: 'Crew Seat Map', icon: '▦' },
    { id: 'exchange', label: 'Meal Exchange', icon: '⇄' },
  ],
  'Catering Staff': [
    { id: 'dashboard', label: 'Dashboard', icon: '◫' },
    { id: 'catering', label: 'Catering', icon: '▤' },
  ],
}

const ACTIVE_EXCHANGE_STATUSES = new Set(['Available', 'Requested', 'Crew review'])
const RESOLVED_CATERING_STATUSES = new Set([
  'Ready',
  'Unable to fulfil',
  'Approved',
  'Rejected by staff',
  'Expired — cutoff',
  'Rejected — selection changed',
])
const PENDING_EXPRESS_SWAP_STATUS = 'Pending staff review'
const MAX_PASSENGERS = 6

function BackgroundStyleControl({ value, onChange }) {
  return (
    <div className="background-style-control" role="group" aria-label="Background Style">
      <span>Background Style</span>
      <button
        type="button"
        aria-pressed={value === 'subtle'}
        onClick={() => onChange('subtle')}
      >
        Subtle
      </button>
      <button
        type="button"
        aria-pressed={value === 'dynamic'}
        onClick={() => onChange('dynamic')}
      >
        Dynamic
      </button>
    </div>
  )
}

function createPassenger(id) {
  return {
    id,
    name: `Passenger ${id}`,
    meal: null,
    allergies: [],
    customAllergy: '',
    dietaryRequirements: [],
    notes: '',
  }
}

function getPassengerSafeOffer(offer) {
  const safeOffer = { ...offer }
  delete safeOffer.finalOutcome
  delete safeOffer.cancellationReason
  delete safeOffer.consentHistory
  delete safeOffer.crewReviewHistory
  delete safeOffer.recipientCrewReviewed
  delete safeOffer.offererCrewReviewed
  return safeOffer
}

function App() {
  const [initialAppData] = useState(loadAppData)
  const [backgroundStyle, setBackgroundStyle] = useState('subtle')
  const [now, setNow] = useState(() => Date.now())
  const [kitchenChecklist, setKitchenChecklist] = useState({
    mealQuantities: false,
    dietaryRequirements: false,
    allergyDeclarations: false,
    outstandingRequests: false,
  })
  const previousKitchenSelectionSignature = useRef(null)
  const previousOutstandingRequestSignature = useRef(null)
  const [passengers, setPassengers] = useState(initialAppData.passengers)
  const [flightReference, setFlightReference] = useState(initialAppData.flightReference)
  const [departureTime, setDepartureTime] = useState(initialAppData.departureTime)
  const [minimumLeadMinutes, setMinimumLeadMinutes] = useState(initialAppData.minimumLeadMinutes)
  const [forecastBufferPercent, setForecastBufferPercent] = useState(initialAppData.forecastBufferPercent)
  const [cateringRequests, setCateringRequests] = useState(initialAppData.cateringRequests)
  const [exchangeOffers, setExchangeOffers] = useState(initialAppData.exchangeOffers)
  const [demoRole, setDemoRole] = useState(null)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [selectedDemoPassengerId, setSelectedDemoPassengerId] = useState(1)
  const [bookingControlMessage, setBookingControlMessage] = useState('')
  const kitchenSelectionSignature = JSON.stringify(
    passengers.map((passenger) => [
      passenger.id,
      passenger.meal,
      Array.isArray(passenger.allergies)
        ? passenger.allergies
            .filter((allergy) => typeof allergy === 'string')
            .map((allergy) => allergy.trim().toLowerCase())
            .sort()
        : [],
      typeof passenger.customAllergy === 'string'
        ? passenger.customAllergy.trim().replace(/\s+/g, ' ').toLowerCase()
        : '',
      Array.isArray(passenger.dietaryRequirements)
        ? [...passenger.dietaryRequirements].sort()
        : [],
    ]),
  )
  const outstandingRequestSignature = JSON.stringify(
    cateringRequests
      .filter((request) =>
        request.outcome === 'submitted' &&
        !RESOLVED_CATERING_STATUSES.has(request.status),
      )
      .map((request) => [request.id, request.status, request.outcome]),
  )

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (previousKitchenSelectionSignature.current === null) {
      previousKitchenSelectionSignature.current = kitchenSelectionSignature
      return
    }
    if (previousKitchenSelectionSignature.current === kitchenSelectionSignature) return

    previousKitchenSelectionSignature.current = kitchenSelectionSignature
    setKitchenChecklist({
      mealQuantities: false,
      dietaryRequirements: false,
      allergyDeclarations: false,
      outstandingRequests: false,
    })
  }, [kitchenSelectionSignature])

  useEffect(() => {
    if (previousOutstandingRequestSignature.current === null) {
      previousOutstandingRequestSignature.current = outstandingRequestSignature
      return
    }
    if (previousOutstandingRequestSignature.current === outstandingRequestSignature) return

    previousOutstandingRequestSignature.current = outstandingRequestSignature
    setKitchenChecklist((current) => ({
      ...current,
      outstandingRequests: false,
    }))
  }, [outstandingRequestSignature])

  useEffect(() => {
    saveAppData({
      passengers,
      flightReference,
      departureTime,
      minimumLeadMinutes,
      forecastBufferPercent,
      cateringRequests,
      exchangeOffers,
    })
  }, [
    passengers,
    flightReference,
    departureTime,
    minimumLeadMinutes,
    forecastBufferPercent,
    cateringRequests,
    exchangeOffers,
  ])

  function handlePassengerChange(passenger, field, value) {
    const hasCurrentMeal = meals.some((meal) => meal.id === passenger.meal)
    if (
      field === 'meal' &&
      cateringRequests.some((request) =>
        request.passengerId === passenger.id &&
        request.changeKind?.includes('meal') &&
        request.outcome === 'submitted' &&
        !RESOLVED_CATERING_STATUSES.has(request.status),
      )
    ) {
      return {
        accepted: false,
        message: 'Resolve the pending meal-change request before changing this passenger’s meal.',
      }
    }
    if (field === 'meal' && !hasCurrentMeal) {
      if (!meals.some((meal) => meal.id === value)) {
        return {
          accepted: false,
          message: 'Choose a supported meal before saving your first selection.',
        }
      }
      return { accepted: true }
    }
    const isMealChange = field === 'meal' && passenger.meal !== value
    const allergiesBefore = passenger.allergies ?? []
    const allergiesAfter = field === 'allergies' ? value : allergiesBefore
    const customBefore = passenger.customAllergy?.trim() ?? ''
    const customAfter =
      field === 'customAllergy' ? value.trim() : customBefore
    const supportedAllergiesChanged =
      field === 'allergies' &&
      (
        allergiesBefore.length !== allergiesAfter.length ||
        allergiesBefore.some((allergy) => !allergiesAfter.includes(allergy))
      )
    const customAllergyChanged =
      field === 'customAllergy' && customBefore !== customAfter
    const allergyChange = supportedAllergiesChanged || customAllergyChanged

    if (!isMealChange && !allergyChange) return { accepted: true }

    const timestamp = new Date().toISOString()
    if (allergyChange) {
      setExchangeOffers((current) =>
        current.map((offer) => {
          if (
            !['Available', 'Requested', 'Crew review'].includes(offer.status) ||
            (offer.passengerId !== passenger.id &&
              offer.recipientId !== passenger.id)
          ) {
            return offer
          }

          const isRecipient = offer.recipientId === passenger.id
          const consentField = isRecipient
            ? 'requesterAcceptedOfferedMeal'
            : 'offererAcceptedRecipientMeal'
          const reviewField = isRecipient
            ? 'recipientCrewReviewed'
            : 'offererCrewReviewed'
          const nextStatus =
            offer.status === 'Crew review' ? 'Requested' : offer.status
          const statusHistory =
            nextStatus === offer.status
              ? offer.statusHistory
              : [
                  ...offer.statusHistory,
                  { status: nextStatus, timestamp },
                ]

          return {
            ...offer,
            status: nextStatus,
            [consentField]: false,
            [reviewField]: false,
            updatedAt: timestamp,
            statusHistory,
          }
        }),
      )
    }
    const departureTimestamp = departureTime
      ? new Date(departureTime).getTime()
      : Number.NaN
    const timeConfigured = Number.isFinite(departureTimestamp)
    const remainingAtReceipt = departureTimestamp - Date.parse(timestamp)
    const requestLate =
      isMealChange &&
      (
        !timeConfigured ||
        remainingAtReceipt < minimumLeadMinutes * 60_000
      )
    const urgentAtReceipt =
      timeConfigured &&
      remainingAtReceipt >= 0 &&
      remainingAtReceipt <= URGENT_WINDOW_MS
    const priorityReason = [
      allergyChange
        ? 'An allergy declaration was changed; manual verification is required.'
        : null,
      urgentAtReceipt
        ? 'The request was received within 60 minutes before configured departure.'
        : null,
      !timeConfigured
        ? 'Departure time is missing or invalid; time-based priority is undetermined.'
        : null,
      timeConfigured && remainingAtReceipt < 0
        ? 'The configured departure time had already passed when this request was received.'
        : null,
      timeConfigured &&
      remainingAtReceipt > URGENT_WINDOW_MS
        ? 'The request was received more than 60 minutes before configured departure.'
        : null,
      requestLate && !timeConfigured
        ? 'Rejected because departure time is missing or invalid; eligibility cannot be determined.'
        : null,
      requestLate && timeConfigured
        ? `Rejected because fewer than ${minimumLeadMinutes} minutes remain before departure.`
        : null,
    ].filter(Boolean).join(' ')

    const request = {
      id: crypto.randomUUID(),
      passengerId: passenger.id,
      passengerName: passenger.name,
      flightReference: flightReference.trim(),
      seat: null,
      changeKind: [
        ...(isMealChange ? ['meal'] : []),
        ...(allergyChange ? ['allergy'] : []),
      ],
      ...(isMealChange && {
        previousMeal: getMealName(passenger.meal),
        previousMealId: passenger.meal,
        requestedMeal: getMealName(value),
        requestedMealId: value,
      }),
      allergyChange,
      ...(allergyChange && {
        previousAllergies: getAllergyDescription(passenger),
        updatedAllergies: getAllergyDescription({
          ...passenger,
          allergies: allergiesAfter,
          customAllergy: field === 'customAllergy' ? value : passenger.customAllergy,
        }),
      }),
      timestamp,
      priority: allergyChange && urgentAtReceipt
        ? 'ALLERGY ALERT + URGENT'
        : allergyChange
          ? 'ALLERGY ALERT'
          : urgentAtReceipt
            ? 'URGENT'
            : timeConfigured
              ? 'STANDARD'
              : 'TIME UNDETERMINED',
      urgentAtReceipt,
      priorityReason,
      outcome: requestLate ? 'rejected' : 'submitted',
      rejectionReason: requestLate ? priorityReason : null,
      status: requestLate
        ? timeConfigured
          ? 'Rejected — cutoff'
          : 'Rejected — departure unconfigured'
        : 'New',
      statusHistory: [{
        status: requestLate
          ? timeConfigured
            ? 'Rejected — cutoff'
            : 'Rejected — departure unconfigured'
          : 'New',
        timestamp,
      }],
      passengerNotes: passenger.notes?.trim() ?? '',
    }

    setCateringRequests((current) => [request, ...current])
    if (!requestLate) return { accepted: true }
    return {
      accepted: false,
      message: timeConfigured
        ? LATE_MEAL_MESSAGE
        : 'A departure date and time is required before a new meal request can be submitted. Your existing meal selection remains unchanged. Allergy declarations can still be submitted for staff review.',
    }
  }

  function handleRequestStatusChange(requestId, status) {
    const request = cateringRequests.find((item) => item.id === requestId)
    if (!request || request.outcome !== 'submitted') return
    const nextStatus = {
      New: ['Acknowledged', 'Unable to fulfil'],
      Acknowledged: ['Preparing', 'Unable to fulfil'],
      Preparing: ['Ready', 'Unable to fulfil'],
      Ready: [],
      'Unable to fulfil': [],
    }
    if (!nextStatus[request.status]?.includes(status)) return

    setCateringRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status,
              statusHistory: [
                ...(request.statusHistory ?? []),
                { status, timestamp: new Date().toISOString() },
              ],
            }
          : request,
      ),
    )
    if (
      status === 'Unable to fulfil' &&
      request.previousMealId &&
      request.requestedMealId
    ) {
      setPassengers((current) =>
        current.map((passenger) =>
          passenger.id === request.passengerId &&
          passenger.meal === request.requestedMealId
            ? { ...passenger, meal: request.previousMealId }
            : passenger,
        ),
      )
    }
  }

  function handleExpressMealRequest(passenger, requestedMealId) {
    const currentPassenger = passengers.find((item) => item.id === passenger.id)
    const requestedMeal = meals.find((meal) => meal.id === requestedMealId)
    if (!currentPassenger || !requestedMeal) {
      return { accepted: false, message: 'Select an available meal for this passenger.' }
    }
    if (currentPassenger.meal === requestedMealId) {
      return { accepted: false, message: 'Choose a meal different from the current selection.' }
    }
    if (cateringRequests.some((request) =>
      request.passengerId === passenger.id &&
      request.changeKind?.includes('meal') &&
      request.outcome === 'submitted' &&
      !RESOLVED_CATERING_STATUSES.has(request.status),
    )) {
      return {
        accepted: false,
        message: 'A meal-change request is already pending for this passenger. Wait for its outcome before submitting another.',
      }
    }

    const timestamp = new Date().toISOString()
    const departureTimestamp = departureTime ? Date.parse(departureTime) : Number.NaN
    const timeConfigured = Number.isFinite(departureTimestamp)
    const remainingAtReceipt = timeConfigured
      ? departureTimestamp - Date.parse(timestamp)
      : Number.NaN
    const eligible =
      timeConfigured &&
      remainingAtReceipt >= minimumLeadMinutes * 60_000
    const urgentAtReceipt =
      timeConfigured &&
      remainingAtReceipt >= 0 &&
      remainingAtReceipt <= URGENT_WINDOW_MS
    const outcomeMessage = eligible
      ? 'Request received and awaiting staff review. Preparation and gate delivery are not confirmed.'
      : timeConfigured
        ? LATE_MEAL_MESSAGE
        : 'A departure date and time is required before a meal-change request can be submitted. Your current meal remains unchanged.'
    const status = eligible
      ? PENDING_EXPRESS_SWAP_STATUS
      : timeConfigured
        ? 'Rejected — cutoff'
        : 'Rejected — departure unconfigured'
    const request = {
      id: crypto.randomUUID(),
      requestType: 'express-meal-swap',
      passengerId: currentPassenger.id,
      passengerName: currentPassenger.name,
      flightReference: flightReference.trim(),
      seat: null,
      changeKind: ['meal'],
      previousMeal: getMealName(currentPassenger.meal),
      previousMealId: currentPassenger.meal,
      requestedMeal: requestedMeal.name,
      requestedMealId,
      timestamp,
      scheduledDepartureTime: departureTime,
      departureTimeAtSubmission: timeConfigured
        ? new Date(departureTimestamp).toISOString()
        : '',
      timeRemainingAtSubmissionMs: remainingAtReceipt,
      urgentAtReceipt,
      priority: urgentAtReceipt ? 'URGENT' : timeConfigured ? 'STANDARD' : 'TIME UNDETERMINED',
      priorityReason: urgentAtReceipt
        ? 'The request was received within 60 minutes before configured departure.'
        : null,
      outcome: eligible ? 'submitted' : 'rejected',
      status,
      outcomeMessage,
      rejectionReason: eligible ? null : outcomeMessage,
      statusHistory: [{ status, timestamp }],
    }
    setCateringRequests((current) => [request, ...current])
    return { accepted: eligible, message: outcomeMessage }
  }

  function handleExpressMealDecision(requestId, decision) {
    const request = cateringRequests.find((item) => item.id === requestId)
    if (
      !request ||
      request.requestType !== 'express-meal-swap' ||
      request.outcome !== 'submitted' ||
      request.status !== PENDING_EXPRESS_SWAP_STATUS ||
      !['approve', 'reject'].includes(decision)
    ) return

    const passenger = passengers.find((item) => item.id === request.passengerId)
    const timestamp = new Date().toISOString()
    let status
    let outcome
    let outcomeMessage

    if (decision === 'reject') {
      status = 'Rejected by staff'
      outcome = 'rejected'
      outcomeMessage = 'Staff rejected the request. The current meal selection is unchanged.'
    } else if (!passenger) {
      status = 'Rejected — selection changed'
      outcome = 'rejected'
      outcomeMessage = 'The passenger record is no longer available. The meal was not changed.'
    } else if (passenger.meal !== request.previousMealId) {
      status = 'Rejected — selection changed'
      outcome = 'rejected'
      outcomeMessage = 'The current meal no longer matches this request. The request cannot be approved and the current meal was not changed.'
    } else if (cateringRequests.some((item) =>
      item.passengerId === request.passengerId &&
      item.changeKind?.includes('meal') &&
      Date.parse(item.timestamp) > Date.parse(request.timestamp) &&
      item.outcome === 'submitted',
    )) {
      status = 'Rejected — selection changed'
      outcome = 'rejected'
      outcomeMessage = 'A newer meal request exists. This older request cannot be approved.'
    } else {
      const departureTimestamp = request.scheduledDepartureTime
        ? Date.parse(request.scheduledDepartureTime)
        : Number.NaN
      const timeConfigured = Number.isFinite(departureTimestamp)
      const remainingAtDecision = timeConfigured
        ? departureTimestamp - Date.parse(timestamp)
        : Number.NaN
      const eligible =
        timeConfigured &&
        remainingAtDecision >= minimumLeadMinutes * 60_000
      if (!eligible) {
        status = 'Expired — cutoff'
        outcome = 'rejected'
        outcomeMessage = timeConfigured
          ? `The request expired before staff review because fewer than ${minimumLeadMinutes} minutes remain before departure. The current meal was not changed.`
          : 'The departure time is missing or invalid, so the request cannot be approved. The current meal was not changed.'
      } else {
        status = 'Approved'
        outcome = 'submitted'
        outcomeMessage = 'Staff approved the meal change in this local demo. Preparation and gate delivery are not confirmed.'
        setPassengers((current) =>
          current.map((item) =>
            item.id === passenger.id && item.meal === request.previousMealId
              ? { ...item, meal: request.requestedMealId }
              : item,
          ),
        )
      }
    }

    setCateringRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status,
              outcome,
              outcomeMessage,
              rejectionReason: outcome === 'rejected' ? outcomeMessage : null,
              decidedAt: timestamp,
              decisionTimeRemainingMs: Number.isFinite(request.scheduledDepartureTime
                ? Date.parse(request.scheduledDepartureTime)
                : Number.NaN)
                ? Date.parse(request.scheduledDepartureTime) - Date.parse(timestamp)
                : Number.NaN,
              statusHistory: [
                ...(item.statusHistory ?? []),
                { status, timestamp },
              ],
            }
          : item,
      ),
    )
  }

  function handleDepartureTimeChange(value) {
    setDepartureTime(value)
    setCateringRequests((current) =>
      current.map((request) =>
        request.requestType === 'express-meal-swap' &&
        request.outcome === 'submitted' &&
        request.status === PENDING_EXPRESS_SWAP_STATUS
          ? { ...request, scheduledDepartureTime: value }
          : request,
      ),
    )
  }

  const pendingMealPassengerIds = cateringRequests
    .filter((request) =>
      request.outcome === 'submitted' &&
      request.changeKind?.includes('meal') &&
      !RESOLVED_CATERING_STATUSES.has(request.status),
    )
    .map((request) => request.passengerId)

  function handleAddPassenger() {
    if (passengers.length >= MAX_PASSENGERS) {
      const result = {
        accepted: false,
        message: `This demo booking supports up to ${MAX_PASSENGERS} passengers.`,
      }
      setBookingControlMessage(result.message)
      return result
    }

    const nextId = passengers.reduce(
      (maximum, passenger) => Math.max(maximum, Number(passenger.id) || 0),
      0,
    ) + 1
    setPassengers((current) => [...current, createPassenger(nextId)])
    setSelectedDemoPassengerId(nextId)
    setBookingControlMessage('Passenger added to the shared demo booking.')
    return { accepted: true, passengerId: nextId }
  }

  function handleResetDemoData(createScenario, scenarioLabel) {
    const confirmed = window.confirm(
      `Reset this local demo to the ${scenarioLabel} scenario? This replaces saved passenger data, meal selections, catering requests, and meal exchanges. Your preparation buffer setting is kept. No airline systems are affected.`,
    )
    if (!confirmed) return

    const demoData = createScenario()
    const nextForecastBufferPercent = [3, 4, 5].includes(forecastBufferPercent)
      ? forecastBufferPercent
      : demoData.forecastBufferPercent

    setPassengers(demoData.passengers)
    setFlightReference(demoData.flightReference)
    setDepartureTime(demoData.departureTime)
    setMinimumLeadMinutes(demoData.minimumLeadMinutes)
    setForecastBufferPercent(nextForecastBufferPercent)
    setCateringRequests(demoData.cateringRequests)
    setExchangeOffers(demoData.exchangeOffers)
    setKitchenChecklist({
      mealQuantities: false,
      dietaryRequirements: false,
      allergyDeclarations: false,
      outstandingRequests: false,
    })
    setSelectedDemoPassengerId(demoData.passengers[0].id)
    setBookingControlMessage('')
    setActiveSection('dashboard')
    setDemoRole(null)
  }

  const demoResetActions = (
    <div className="demo-reset-actions" aria-label="Reset local demo scenario">
      <button
        className="demo-reset-button demo-reset-full"
        type="button"
        onClick={() => handleResetDemoData(createDefaultAppData, 'Full Demo')}
      >
        Reset to Full Demo
      </button>
      <button
        className="demo-reset-button demo-reset-first-time"
        type="button"
        onClick={() =>
          handleResetDemoData(
            createFirstTimePassengerDemoData,
            'First-Time Passenger Demo',
          )
        }
      >
        Reset to First-Time Passenger Demo
      </button>
    </div>
  )

  function handleRemovePassenger(passengerId) {
    if (passengers.length <= 1) {
      const result = { accepted: false, message: 'Keep at least one passenger in the demo booking.' }
      setBookingControlMessage(result.message)
      return result
    }

    const hasOpenCateringRequest = cateringRequests.some(
      (request) =>
        request.passengerId === passengerId &&
        request.outcome === 'submitted' &&
        !RESOLVED_CATERING_STATUSES.has(request.status),
    )
    if (hasOpenCateringRequest) {
      const result = {
        accepted: false,
        message: 'Resolve this passenger’s open catering request before removing them. Request history is retained.',
      }
      setBookingControlMessage(result.message)
      return result
    }

    const hasOpenExchange = exchangeOffers.some(
      (offer) =>
        ACTIVE_EXCHANGE_STATUSES.has(offer.status) &&
        (offer.passengerId === passengerId || offer.recipientId === passengerId),
    )
    if (hasOpenExchange) {
      const result = {
        accepted: false,
        message: 'Cancel or complete this passenger’s active meal exchange before removing them. Exchange history is retained.',
      }
      setBookingControlMessage(result.message)
      return result
    }

    const remaining = passengers.filter((passenger) => passenger.id !== passengerId)
    if (remaining.length === passengers.length) {
      const result = { accepted: false, message: 'That passenger is no longer in this booking.' }
      setBookingControlMessage(result.message)
      return result
    }

    setPassengers(remaining)
    if (selectedDemoPassengerId === passengerId) {
      setSelectedDemoPassengerId(remaining[0].id)
    }
    setBookingControlMessage('Passenger removed. Completed request and exchange history remains in this demo.')
    return { accepted: true }
  }

  function handlePassengerUpdate(passengerId, field, value) {
    setPassengers((current) =>
      current.map((passenger) =>
        passenger.id === passengerId
          ? { ...passenger, [field]: value }
          : passenger,
      ),
    )
  }

  const navigation = demoRole ? NAVIGATION[demoRole] : []
  const currentPassenger = passengers.find(
    (passenger) => passenger.id === selectedDemoPassengerId,
  ) ?? passengers[0]
  const visiblePassengerRecords = demoRole === 'Passenger'
    ? passengers.filter((passenger) => passenger.id === currentPassenger?.id)
    : passengers
  const visibleRequests = demoRole === 'Passenger'
    ? cateringRequests.filter(
        (request) => request.passengerId === currentPassenger?.id,
      )
    : cateringRequests
  const passengerExchangeOffers = exchangeOffers
    .filter((offer) =>
      (offer.status === 'Available' && offer.passengerId !== currentPassenger?.id) ||
      offer.passengerId === currentPassenger?.id ||
      offer.recipientId === currentPassenger?.id,
    )
    .map(getPassengerSafeOffer)
  const visibleExchanges = demoRole === 'Passenger'
    ? exchangeOffers.filter(
        (offer) =>
          offer.passengerId === currentPassenger?.id ||
          offer.recipientId === currentPassenger?.id,
      )
    : exchangeOffers

  function handlePassengerExchangeOffersChange(updateOffers) {
    setExchangeOffers((current) => {
      const visible = current
        .filter((offer) =>
          (offer.status === 'Available' && offer.passengerId !== currentPassenger?.id) ||
          offer.passengerId === currentPassenger?.id ||
          offer.recipientId === currentPassenger?.id,
        )
        .map(getPassengerSafeOffer)
      const updated = updateOffers(visible)
      const visibleIds = new Set(visible.map((offer) => offer.id))
      const updatedById = new Map(updated.map((offer) => [offer.id, offer]))
      const preserved = current
        .filter((offer) => !visibleIds.has(offer.id))
        .map((offer) => ({ offer }))
      const merged = current
        .filter((offer) => visibleIds.has(offer.id))
        .flatMap((offer) => {
          const next = updatedById.get(offer.id)
          if (!next) return []
          updatedById.delete(offer.id)
          return [{ offer: { ...offer, ...next } }]
        })
      const additions = [...updatedById.values()].map((offer) => ({ offer }))
      return [...preserved, ...merged, ...additions].map(({ offer }) => offer)
    })
  }
  const mealCounts = visiblePassengerRecords.reduce((counts, passenger) => {
    const meal = meals.find((item) => item.id === passenger.meal)
    if (meal) counts[meal.name] = (counts[meal.name] ?? 0) + 1
    return counts
  }, {})
  const unselectedMealPassengerCount = passengers.filter(
    (passenger) => !meals.some((meal) => meal.id === passenger.meal),
  ).length
  const visibleUnselectedMealPassengerCount = visiblePassengerRecords.filter(
    (passenger) => !meals.some((meal) => meal.id === passenger.meal),
  ).length
  const requiredCategories = visiblePassengerRecords.reduce((categories, passenger) => {
    const meal = meals.find((item) => item.id === passenger.meal)
    if (meal) categories[meal.category] = (categories[meal.category] ?? 0) + 1
    return categories
  }, {})
  const kitchenMealCounts = passengers.reduce((counts, passenger) => {
    const meal = meals.find((item) => item.id === passenger.meal)
    if (meal) counts.set(meal.name, (counts.get(meal.name) ?? 0) + 1)
    return counts
  }, new Map())
  const kitchenCategoryPassengers = new Map()
  for (const passenger of passengers) {
    const meal = meals.find((item) => item.id === passenger.meal)
    if (!meal) continue
    if (!kitchenCategoryPassengers.has(meal.category)) {
      kitchenCategoryPassengers.set(meal.category, new Set())
    }
    kitchenCategoryPassengers.get(meal.category).add(passenger.id)
  }
  const kitchenCategoryLabels = {
    standard: 'Standard',
    sattvik: 'Sattvik',
    jain: 'Strict Jain',
    vegan: 'Vegan',
    iftar: 'Iftar',
  }
  const kitchenCategoryCounts = [...new Set(meals.map((meal) => meal.category))]
    .map((category) => ({
      category,
      label: kitchenCategoryLabels[category] ?? category,
      count: kitchenCategoryPassengers.get(category)?.size ?? 0,
    }))
  const kitchenPreparationItems = meals.map((meal) => ({
    meal,
    categoryLabel: kitchenCategoryLabels[meal.category] ?? meal.category,
    count: kitchenMealCounts.get(meal.name) ?? 0,
    preparationReminder: {
      standard: 'No verified preparation method or full recipe is recorded. Verify the approved recipe and service instructions.',
      sattvik: 'The catalogue description says without onion or garlic. Verify the approved recipe meets the declared requirement; a kitchen procedure is not recorded.',
      jain: 'The catalogue describes this as Jain-style but does not specify strict Jain preparation requirements. Verify the approved requirement and recipe.',
      vegan: 'The catalogue labels this meal vegan. Verify the complete ingredients and approved preparation details; a kitchen procedure is not recorded.',
      iftar: 'The catalogue describes this as an Iftar concept. Confirm service requirements and the approved recipe; timing and preparation procedures are not recorded.',
    }[meal.category] ?? 'Preparation details are not recorded. Verify the approved recipe and service instructions.',
  }))
  const forecastPreparationItems = meals.map((meal) => {
    const selectedDemand = passengers.filter(
      (passenger) => passenger.meal === meal.id,
    ).length
    const bufferQuantity = Math.ceil(
      selectedDemand * forecastBufferPercent / 100,
    )

    return {
      meal,
      selectedDemand,
      bufferQuantity,
      suggestedQuantity: selectedDemand + bufferQuantity,
    }
  })
  const declaredAllergyCounts = new Map()
  const affectedPassengerIds = new Set()
  for (const passenger of passengers) {
    const passengerAllergies = new Map()
    const declarations = [
      ...(Array.isArray(passenger.allergies) ? passenger.allergies : []),
      passenger.customAllergy,
    ]
    for (const declaration of declarations) {
      if (typeof declaration !== 'string') continue
      const value = declaration.trim()
      if (!value) continue
      const normalized = value.replace(/\s+/g, ' ').toLowerCase()
      const supportedAllergen = supportedAllergens.find(
        (allergen) => allergen.id.toLowerCase() === normalized,
      )
      const label = supportedAllergen?.label ?? value.replace(/\s+/g, ' ')
      const key = label.replace(/\s+/g, ' ').toLowerCase()
      if (!passengerAllergies.has(key)) passengerAllergies.set(key, label)
    }
    if (!passengerAllergies.size) continue

    affectedPassengerIds.add(passenger.id)
    passengerAllergies.forEach((label, key) => {
      const existing = declaredAllergyCounts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        declaredAllergyCounts.set(key, { label, count: 1 })
      }
    })
  }
  const kitchenChecklistItems = [
    { id: 'mealQuantities', label: 'Review current meal quantities' },
    { id: 'dietaryRequirements', label: 'Review dietary preparation categories' },
    {
      id: 'allergyDeclarations',
      label: 'Verify allergy declarations against ingredients, supplier information, and cross-contact controls',
    },
    { id: 'outstandingRequests', label: 'Review outstanding catering and meal-change requests' },
  ]
  const locallyCheckedTaskCount = kitchenChecklistItems.filter(
    (item) => kitchenChecklist[item.id],
  ).length
  const unresolvedRequests = visibleRequests.filter(
    (request) =>
      request.outcome === 'submitted' &&
      !RESOLVED_CATERING_STATUSES.has(request.status),
  )
  const outstandingKitchenRequestCount = cateringRequests.filter(
    (request) =>
      request.outcome === 'submitted' &&
      !RESOLVED_CATERING_STATUSES.has(request.status),
  ).length
  const approvedExpressSwapCount = cateringRequests.filter(
    (request) =>
      request.requestType === 'express-meal-swap' &&
      request.status === 'Approved',
  ).length
  const departureTimestamp = departureTime
    ? new Date(departureTime).getTime()
    : Number.NaN
  const urgentRequests = unresolvedRequests.filter((request) => {
    const receivedAt = Date.parse(request.timestamp)
    const urgentAtReceipt =
      Number.isFinite(receivedAt) &&
      Number.isFinite(departureTimestamp) &&
      receivedAt <= departureTimestamp &&
      departureTimestamp - receivedAt <= URGENT_WINDOW_MS
    const currentlyUrgent =
      Number.isFinite(departureTimestamp) &&
      departureTimestamp >= now &&
      departureTimestamp - now <= URGENT_WINDOW_MS
    return urgentAtReceipt || currentlyUrgent
  })
  const pendingExchanges = visibleExchanges.filter((offer) =>
    ['Requested', 'Crew review'].includes(offer.status),
  )
  const recentActivity = [
    ...visibleRequests.map((request) => ({
      id: `request-${request.id}`,
      timestamp: request.timestamp,
      kind: request.allergyChange ? 'ALLERGY REVIEW' : 'MEAL REQUEST',
      title: demoRole === 'Passenger'
        ? 'Your change was recorded'
        : `${request.passengerName || 'Passenger'} · ${request.status}`,
      detail: request.allergyChange
        ? 'Allergy declaration requires direct verification.'
        : request.previousMeal
          ? `${request.previousMeal} → ${request.requestedMeal}`
          : request.status,
      tone: request.allergyChange ? 'activity-alert' : 'activity-request',
    })),
    ...visibleExchanges.map((offer) => ({
      id: `exchange-${offer.id}`,
      timestamp: offer.updatedAt || offer.createdAt,
      kind: 'MEAL EXCHANGE',
      title: demoRole === 'Passenger'
        ? 'Your exchange activity'
        : `Exchange · ${offer.status}`,
      detail: offer.status,
      tone: offer.status === 'Completed' ? 'activity-complete' : 'activity-exchange',
    })),
  ]
    .filter((activity) => Number.isFinite(Date.parse(activity.timestamp)))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 4)
  const setSection = (section) => {
    if (navigation.some((item) => item.id === section)) {
      setActiveSection(section)
    }
  }
  const goTo = (section) => {
    setSection(section)
  }
  const handleExitDemoSession = () => {
    setDemoRole(null)
    setActiveSection('dashboard')
    setBookingControlMessage('')
  }

  if (!demoRole) {
    const roleCards = [
      {
        role: 'Passenger',
        eyebrow: 'PERSONAL JOURNEY',
        icon: '✳',
        title: 'Passenger',
        description: 'Manage one selected demo passenger’s meal preferences, allergy declarations, and exchange activity.',
        action: 'Enter passenger demo',
      },
      {
        role: 'Cabin Crew',
        eyebrow: 'CABIN OPERATIONS',
        icon: '▦',
        title: 'Cabin Crew',
        description: 'Review the illustrative seat map, passenger meal details, allergy flags, and exchange reviews.',
        action: 'Enter crew demo',
      },
      {
        role: 'Catering Staff',
        eyebrow: 'CATERING OPERATIONS',
        icon: '▤',
        title: 'Catering Operations',
        description: 'Review current meal totals, configured departure cutoff, priority requests, and catering status history.',
        action: 'Enter catering demo',
      },
    ]

    return (
      <main className="demo-entry" data-background-style={backgroundStyle}>
        <FlightPathBackground mode={backgroundStyle} />
        <header className="entry-header">
          <a className="entry-brand" href="#demo-entry" aria-label="SkyBite AI demo home">
            <span className="entry-brand-mark">S</span>
            <span>SkyBite <em>AI</em></span>
          </a>
          <BackgroundStyleControl value={backgroundStyle} onChange={setBackgroundStyle} />
          <span className="entry-demo-pill"><i /> HACKATHON DEMO · LOCAL DATA</span>
        </header>
        <section className="entry-content" aria-labelledby="entry-title">
          <div className="entry-copy">
            <span className="entry-kicker">A MORE THOUGHTFUL FLIGHT EXPERIENCE</span>
            <h1 id="entry-title">Welcome aboard<span>.</span></h1>
            <p>
              Explore how passenger choices, cabin service, and catering
              coordination can work together around one shared demo booking.
            </p>
            <div className="entry-flight-context">
              <span className="entry-flight-icon" aria-hidden="true">↗</span>
              <div>
                <span>DEMO FLIGHT · ILLUSTRATIVE</span>
                <strong>{flightReference || 'No flight reference configured'}</strong>
              </div>
            </div>
          </div>

          <div className="role-card-heading">
            <span>CHOOSE A DEMO EXPERIENCE</span>
            <p>Each role opens a focused workspace. Exit to return and explore another.</p>
          </div>
          <div className="role-card-grid">
            {roleCards.map((card, index) => (
              <article className={`role-card role-card-${index + 1}`} key={card.role}>
                <div className="role-card-top">
                  <span className="role-card-icon" aria-hidden="true">{card.icon}</span>
                  <span>{card.eyebrow}</span>
                </div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
                {card.role === 'Passenger' && passengers.length > 1 && (
                  <div className="entry-passenger-select">
                    <label htmlFor="entry-demo-passenger">Selected demo booking member</label>
                    <select
                      id="entry-demo-passenger"
                      value={currentPassenger?.id ?? ''}
                      onChange={(event) => {
                        setSelectedDemoPassengerId(Number(event.target.value))
                        setBookingControlMessage('')
                      }}
                    >
                      {passengers.map((passenger, index) => (
                        <option key={passenger.id} value={passenger.id}>
                          Demo passenger {index + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  className="role-card-action"
                  type="button"
                  onClick={() => {
                    setDemoRole(card.role)
                    setActiveSection('dashboard')
                  }}
                >
                  {card.action}<span aria-hidden="true">↗</span>
                </button>
              </article>
            ))}
          </div>
          <section className="entry-demo-reset" aria-labelledby="entry-demo-reset-heading">
            <div>
              <h2 id="entry-demo-reset-heading">Choose a demo scenario</h2>
              <p>Reset the local data before starting a rehearsal.</p>
            </div>
            {demoResetActions}
          </section>
          <p className="entry-privacy-note">
            <strong>Demo privacy note</strong>
            Role views limit what the interface displays; this frontend has no
            authentication or server-side authorization. This is not a security boundary.
          </p>
        </section>
        <footer className="entry-footer">
          <span>SKYBITE AI · MEALS THAT MAKE ROOM FOR EVERYONE</span>
          <span>Local prototype · No airline or caterer connection</span>
        </footer>
      </main>
    )
  }

  return (
    <div className="skybite app-shell" data-background-style={backgroundStyle}>
      <FlightPathBackground mode={backgroundStyle} />
      <aside className="app-sidebar" aria-label="Main navigation">
        <a className="app-brand" href="#dashboard" onClick={() => goTo('dashboard')}>
          <span className="app-brand-mark">S</span>
          <span>SkyBite <small>AI</small></span>
        </a>
        <span className="sidebar-caption">OPERATIONS</span>
        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <button
              className={`sidebar-link${activeSection === item.id ? ' active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => goTo(item.id)}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.id === 'catering' && urgentRequests.length > 0 && (
                <span className="nav-count">{urgentRequests.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-flight-dot" />
          Local demo workspace
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="mobile-brand">
            <span className="app-brand-mark">S</span>
            <strong>SkyBite <small>AI</small></strong>
          </div>
          <label className="header-flight">
            <span>DEMO FLIGHT · ILLUSTRATIVE DATA</span>
            {demoRole === 'Passenger' ? (
              <strong className="header-flight-value">{flightReference || 'No reference configured'}</strong>
            ) : (
              <select
                aria-label="Current demo flight"
                value={flightReference}
                onChange={(event) => setFlightReference(event.target.value)}
              >
                <option value="">No flight reference configured</option>
                {flightReference && flightReference !== 'SB-DEMO-001' && (
                  <option value={flightReference}>{flightReference} · Current local context</option>
                )}
                <option value="SB-DEMO-001">SB-DEMO-001 · Illustrative demo flight</option>
              </select>
            )}
          </label>
          <div className="session-role">
            <span>DEMO SESSION</span>
            <strong>{demoRole === 'Catering Staff' ? 'Catering Operations' : demoRole}</strong>
          </div>
          <BackgroundStyleControl value={backgroundStyle} onChange={setBackgroundStyle} />
          <button
            className="exit-session-button"
            type="button"
            onClick={handleExitDemoSession}
          >
            Exit demo session
          </button>
          <label className="mobile-nav-control">
            <span className="sr-only">Navigate to section</span>
            <select value={activeSection} onChange={(event) => setSection(event.target.value)}>
              {navigation.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </header>

        <div className="demo-mode-notice">
          <span role="note">
            DEMO MODE — roles only change this interface. There is no sign-in,
            trusted server, or real access control.
          </span>
          {demoResetActions}
        </div>

        <main className="workspace">
          {activeSection === 'dashboard' && (
            <section className="workspace-page" aria-labelledby="dashboard-heading">
              <div className="page-heading">
                <div>
                  <span className="page-kicker">FLIGHT OPERATIONS · {flightReference || 'NO REFERENCE'}</span>
                  <h1 id="dashboard-heading">Dashboard</h1>
                  <p>
                    {demoRole === 'Passenger'
                      ? 'A private view of your selected demo passenger record.'
                      : 'A live summary of this browser session’s shared demo records.'}
                    {' '}All flight details and records shown are illustrative.
                  </p>
                </div>
                <span className="flight-chip"><i /> {flightReference || 'Flight not configured'}</span>
              </div>
              <div className="dashboard-metrics">
                <article className="metric-card">
                  <span>{demoRole === 'Passenger' ? 'Your passenger record' : 'Passengers in booking'}</span>
                  <strong>{visiblePassengerRecords.length}</strong>
                  <small>Current demo-flight records</small>
                </article>
                <article className="metric-card">
                  <span>Pending catering requests</span>
                  <strong>{unresolvedRequests.length}</strong>
                  <small>Received, not confirmed as fulfilled</small>
                </article>
                <article className="metric-card metric-urgent">
                  <span>Urgent requests</span>
                  <strong>{urgentRequests.length}</strong>
                  <small>Within the configured departure window</small>
                </article>
                <article className="metric-card">
                  <span>Pending meal exchanges</span>
                  <strong>{pendingExchanges.length}</strong>
                  <small>Requested or awaiting crew review</small>
                </article>
              </div>

              <section className="demo-walkthrough" aria-labelledby="demo-walkthrough-heading">
                <div className="demo-walkthrough-heading">
                  <div>
                    <span className="page-kicker">PRESENTER GUIDE</span>
                    <h2 id="demo-walkthrough-heading">Demo walkthrough</h2>
                    <p>Follow these steps to explore how the existing workspaces share illustrative demo data.</p>
                  </div>
                  <span className="demo-walkthrough-static">Static guide · no automatic completion</span>
                </div>
                <ol className="demo-walkthrough-steps">
                  <li>
                    <div className="demo-walkthrough-step-number" aria-hidden="true">1</div>
                    <div className="demo-walkthrough-step-content">
                      <h3>Choose a passenger meal</h3>
                      <p>In the Passenger role, open passenger records and select a possible dietary recommendation or meal. Recommendations are advisory; the passenger makes the choice.</p>
                      <button
                        type="button"
                        className="demo-walkthrough-action"
                        onClick={() => (
                          demoRole === 'Passenger'
                            ? goTo('passengers')
                            : handleExitDemoSession()
                        )}
                      >
                        {demoRole === 'Passenger' ? 'Open passenger selections' : 'Return to role chooser'}
                        <span aria-hidden="true">→</span>
                      </button>
                      {demoRole !== 'Passenger' && (
                        <small>Then choose Passenger and open the passenger workspace.</small>
                      )}
                    </div>
                  </li>
                  <li>
                    <div className="demo-walkthrough-step-number" aria-hidden="true">2</div>
                    <div className="demo-walkthrough-step-content">
                      <h3>Review the shared passenger state</h3>
                      <p>Exit the session, choose Cabin Crew, and inspect passenger selections and declared needs. The seat map is illustrative, not a verified aircraft layout.</p>
                      <button
                        type="button"
                        className="demo-walkthrough-action"
                        onClick={() => (
                          demoRole === 'Cabin Crew'
                            ? goTo('crew')
                            : handleExitDemoSession()
                        )}
                      >
                        {demoRole === 'Cabin Crew' ? 'Open crew seat map' : 'Return to role chooser'}
                        <span aria-hidden="true">→</span>
                      </button>
                      {demoRole !== 'Cabin Crew' && (
                        <small>Then choose Cabin Crew and open Crew Seat Map.</small>
                      )}
                    </div>
                  </li>
                  <li>
                    <div className="demo-walkthrough-step-number" aria-hidden="true">3</div>
                    <div className="demo-walkthrough-step-content">
                      <h3>Inspect catering preparation estimates</h3>
                      <p>Enter Catering Operations to review current meal counts, declared allergy flags requiring staff review, and the rules-based preparation estimate.</p>
                      <button
                        type="button"
                        className="demo-walkthrough-action"
                        onClick={() => (
                          demoRole === 'Catering Staff'
                            ? goTo('catering')
                            : handleExitDemoSession()
                        )}
                      >
                        {demoRole === 'Catering Staff' ? 'Open catering operations' : 'Return to role chooser'}
                        <span aria-hidden="true">→</span>
                      </button>
                      {demoRole !== 'Catering Staff' && (
                        <small>Then choose Catering Operations and open Catering.</small>
                      )}
                    </div>
                  </li>
                  <li>
                    <div className="demo-walkthrough-step-number" aria-hidden="true">4</div>
                    <div className="demo-walkthrough-step-content">
                      <h3>Demonstrate an Express Swap</h3>
                      <p>
                        First configure a future illustrative departure in Catering with at least {minimumLeadMinutes} minutes of lead time. Then switch to Passenger to request a swap, and return to Catering to review it.
                      </p>
                      <span className={`demo-walkthrough-prerequisite${Number.isFinite(departureTimestamp) ? ' is-configured' : ''}`}>
                        {Number.isFinite(departureTimestamp)
                          ? 'Departure time configured · cutoff still applies'
                          : 'Departure time required before a meal-change request'}
                      </span>
                      <button
                        type="button"
                        className="demo-walkthrough-action"
                        onClick={() => (
                          demoRole === 'Catering Staff'
                            ? goTo('catering')
                            : handleExitDemoSession()
                        )}
                      >
                        {demoRole === 'Catering Staff' ? 'Open catering settings and queue' : 'Return to role chooser'}
                        <span aria-hidden="true">→</span>
                      </button>
                      {demoRole !== 'Catering Staff' && (
                        <small>Choose Catering Operations first to configure departure time.</small>
                      )}
                    </div>
                  </li>
                </ol>
              </section>

              {urgentRequests.length > 0 && (
                <section className="urgent-update-panel" aria-labelledby="urgent-updates-heading">
                  <div className="urgent-update-heading">
                    <span className="urgent-update-icon" aria-hidden="true">!</span>
                    <div>
                      <span>PRIORITY ATTENTION</span>
                      <h2 id="urgent-updates-heading">Urgent change requests</h2>
                    </div>
                    <strong>{urgentRequests.length}</strong>
                  </div>
                  <div className="urgent-update-list">
                    {urgentRequests.slice(0, 3).map((request) => (
                      <div className="urgent-update-item" key={request.id}>
                        <div>
                          <strong>
                            {demoRole === 'Passenger'
                              ? 'Your request'
                              : request.passengerName || 'Passenger request'}
                          </strong>
                          <span>
                            {request.allergyChange
                              ? 'Allergy declaration · verify directly'
                              : `${request.previousMeal || 'Meal'} → ${request.requestedMeal || 'Meal change'}`}
                          </span>
                        </div>
                        <span className="urgent-update-status">{request.status}</span>
                      </div>
                    ))}
                  </div>
                  {demoRole === 'Catering Staff' && (
                    <button type="button" className="urgent-update-action" onClick={() => goTo('catering')}>
                      Open catering queue <span aria-hidden="true">→</span>
                    </button>
                  )}
                </section>
              )}

              <div className="dashboard-overview">
                <section className="flight-overview-panel">
                  <div className="overview-panel-top">
                    <span>FLIGHT OVERVIEW</span>
                    <span className="demo-flight-tag">DEMO DATA</span>
                  </div>
                  <div className="flight-route-visual">
                    <span className="route-node" />
                    <span className="route-dash" />
                    <span className="route-plane" aria-hidden="true">✈</span>
                    <span className="route-dash" />
                    <span className="route-node route-node-end" />
                  </div>
                  <strong className="flight-reference-large">{flightReference || 'Flight reference not set'}</strong>
                  <p>This prototype has no airport or itinerary records. The flight reference is a shared local demo label.</p>
                  <div className="flight-overview-meta">
                    <div>
                      <span>Scheduled departure</span>
                      <strong>
                        {departureTime && Number.isFinite(Date.parse(departureTime))
                          ? new Date(departureTime).toLocaleString()
                          : 'Not configured'}
                      </strong>
                    </div>
                    <div>
                      <span>New-request cutoff</span>
                      <strong>{minimumLeadMinutes} min before departure</strong>
                    </div>
                  </div>
                  {demoRole !== 'Passenger' && (
                    <button
                      type="button"
                      className="overview-action"
                      onClick={() => goTo(demoRole === 'Catering Staff' ? 'catering' : 'passengers')}
                    >
                      {demoRole === 'Catering Staff' ? 'Review catering queue' : 'Manage passenger booking'}
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                </section>

                <section className="recent-activity-panel">
                  <div className="overview-panel-top">
                    <span>RECENT ACTIVITY</span>
                    <span className="activity-local-tag">THIS SESSION</span>
                  </div>
                  {recentActivity.length ? (
                    <ol className="recent-activity-list">
                      {recentActivity.map((activity) => (
                        <li className={activity.tone} key={activity.id}>
                          <span className="activity-marker" />
                          <div>
                            <span className="activity-kind">{activity.kind}</span>
                            <strong>{activity.title}</strong>
                            <p>{activity.detail}</p>
                            <time dateTime={activity.timestamp}>
                              {new Date(activity.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="activity-empty">
                      <span aria-hidden="true">◷</span>
                      <strong>No activity yet</strong>
                      <p>Meal and allergy changes, catering updates, and exchange steps will appear here.</p>
                    </div>
                  )}
                  <p className="activity-footnote">Activity is stored in this browser session only.</p>
                </section>
              </div>

              <div className="dashboard-grid">
                <section className="dashboard-card">
                  <div className="dashboard-card-heading">
                    <div><span className="page-kicker">MEAL SUMMARY</span><h2>Current selections</h2></div>
                    {demoRole === 'Passenger' && <span className="privacy-chip">Your record only</span>}
                  </div>
                  {Object.keys(mealCounts).length ? (
                    <ul className="summary-list">
                      {Object.entries(mealCounts).map(([name, count]) => (
                        <li key={name}>
                          <span className="meal-distribution-name">{name}</span>
                          <span className="meal-distribution-track">
                            <i style={{ width: `${Math.min(100, (count / Math.max(visiblePassengerRecords.length, 1)) * 100)}%` }} />
                          </span>
                          <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No meal selections recorded.</p>}
                  {visibleUnselectedMealPassengerCount > 0 && (
                    <div className="unselected-meal-count">
                      <span>No meal selected</span>
                      <strong>{visibleUnselectedMealPassengerCount} {visibleUnselectedMealPassengerCount === 1 ? 'passenger' : 'passengers'}</strong>
                    </div>
                  )}
                  <p className="dashboard-footnote">Selection counts are not confirmed catering orders.</p>
                </section>
                {demoRole !== 'Passenger' && (
                  <section className="dashboard-card">
                    <div className="dashboard-card-heading">
                      <div><span className="page-kicker">DIETARY CATEGORIES</span><h2>Required categories</h2></div>
                    </div>
                    {Object.keys(requiredCategories).length ? (
                      <ul className="summary-list">
                        {Object.entries(requiredCategories).map(([category, count]) => (
                          <li key={category}><span className="category-name">{category}</span><strong>{count}</strong></li>
                        ))}
                      </ul>
                    ) : <p>No dietary categories recorded.</p>}
                    <p className="dashboard-footnote">Categories are derived from current passenger selections.</p>
                  </section>
                )}
              </div>
              <section className="quick-links" aria-label="Quick navigation">
                <div><span className="page-kicker">QUICK ACCESS</span><h2>Go to a workspace</h2></div>
                <div className="quick-link-list">
                  {navigation.filter((item) => item.id !== 'dashboard').map((item) => (
                    <button type="button" className="quick-link" key={item.id} onClick={() => goTo(item.id)}>
                      <span>{item.icon} {item.label}</span><span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeSection === 'passengers' && (
            <section className="workspace-page" aria-labelledby="passengers-heading">
              <div className="page-heading">
                <div>
                  <span className="page-kicker">{demoRole === 'Passenger' ? 'PASSENGER SELF-SERVICE' : 'PASSENGER RECORDS'}</span>
                  <h1 id="passengers-heading">{demoRole === 'Passenger' ? 'Your passenger details' : 'Passengers'}</h1>
                  <p>{demoRole === 'Passenger' ? 'Only the selected demo record is shown here.' : 'Shared passenger preferences and declared dietary information for crew service.'}</p>
                </div>
              </div>
              {demoRole === 'Passenger' && passengers.length > 0 && (
                <div className="demo-passenger-picker">
                  <label htmlFor="demo-passenger-select">Choose your demo booking member</label>
                  <select
                    id="demo-passenger-select"
                    className="meal-input"
                    value={currentPassenger?.id ?? ''}
                    onChange={(event) => {
                      setSelectedDemoPassengerId(Number(event.target.value))
                      setBookingControlMessage('')
                    }}
                  >
                    {passengers.map((passenger, index) => (
                      <option key={passenger.id} value={passenger.id}>Demo passenger {index + 1}</option>
                    ))}
                  </select>
                  <p>Selection is for this demonstration only and does not verify identity.</p>
                  <p className="passenger-seat-note">Verified seat: not available in this prototype. The crew map uses illustrative seat positions only.</p>
                </div>
              )}
              <div className="booking-controls">
                {demoRole === 'Passenger' ? (
                  <>
                    <div>
                      <strong>Manage this demo booking</strong>
                      <span>Add or remove a demo traveler. Only the selected record is shown below.</span>
                    </div>
                    <div className="booking-control-actions">
                      <button
                        className="booking-add-button"
                        type="button"
                        onClick={handleAddPassenger}
                        disabled={passengers.length >= MAX_PASSENGERS}
                      >
                        <span aria-hidden="true">＋</span> Add traveler
                      </button>
                      <button
                        className="booking-remove-button"
                        type="button"
                        onClick={() => currentPassenger && handleRemovePassenger(currentPassenger.id)}
                        disabled={passengers.length <= 1 || !currentPassenger}
                      >
                        Remove selected
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>Demo booking · {passengers.length} / {MAX_PASSENGERS} travelers</strong>
                      <span>Count is derived from the shared passenger records.</span>
                    </div>
                    <div className="booking-control-actions">
                      <button
                        className="booking-add-button"
                        type="button"
                        onClick={handleAddPassenger}
                        disabled={passengers.length >= MAX_PASSENGERS}
                      >
                        <span aria-hidden="true">＋</span> Add passenger
                      </button>
                      <button
                        className="booking-remove-button"
                        type="button"
                        onClick={() => passengers.length && handleRemovePassenger(passengers[passengers.length - 1].id)}
                        disabled={passengers.length <= 1}
                      >
                        Remove last passenger
                      </button>
                    </div>
                  </>
                )}
                {bookingControlMessage && (
                  <p className="booking-control-message" role="status">{bookingControlMessage}</p>
                )}
              </div>
              <div className="passenger-workspace-card">
                <PassengerMealSelector
                  passengers={demoRole === 'Passenger'
                    ? (currentPassenger ? [currentPassenger] : [])
                    : passengers}
                  onPassengerUpdate={demoRole === 'Passenger'
                    ? (id, field, value) => {
                        if (id === currentPassenger?.id) {
                          handlePassengerUpdate(id, field, value)
                        }
                      }
                    : handlePassengerUpdate}
                  onPassengerChange={demoRole === 'Passenger'
                    ? (passenger, field, value) =>
                        passenger.id === currentPassenger?.id
                          ? handlePassengerChange(passenger, field, value)
                          : { accepted: false, message: 'Only the selected passenger record can be changed in this demo view.' }
                    : handlePassengerChange}
                  onExpressMealRequest={handleExpressMealRequest}
                  flightReference={flightReference}
                  onFlightReferenceChange={demoRole === 'Passenger'
                    ? undefined
                    : setFlightReference}
                  departureTime={departureTime}
                  minimumLeadMinutes={minimumLeadMinutes}
                  requests={demoRole === 'Passenger'
                    ? cateringRequests.filter(
                        (request) => request.passengerId === currentPassenger?.id,
                      )
                    : cateringRequests}
                  pendingMealPassengerIds={demoRole === 'Passenger'
                    ? pendingMealPassengerIds.filter((id) => id === currentPassenger?.id)
                    : pendingMealPassengerIds}
                  passengerMode={demoRole === 'Passenger'}
                  collapsiblePassengerCards={demoRole === 'Cabin Crew'}
                  lockedExchangePassengerIds={exchangeOffers
                    .filter((offer) =>
                      ['Available', 'Requested', 'Crew review'].includes(offer.status),
                    )
                    .flatMap((offer) => [offer.passengerId, offer.recipientId])
                    .filter((id) =>
                      id !== undefined &&
                      (demoRole !== 'Passenger' || id === currentPassenger?.id),
                    )}
                />
              </div>
            </section>
          )}

          {activeSection === 'crew' && demoRole === 'Cabin Crew' && (
            <section className="workspace-page">
              <div className="page-heading">
                <div><span className="page-kicker">CABIN OPERATIONS</span><h1>Crew Seat Map</h1><p>Passenger-level information is available in this crew demonstration view.</p></div>
              </div>
              <CrewSeatMap
                passengers={passengers}
                requests={cateringRequests}
                departureTime={departureTime}
                now={now}
              />
            </section>
          )}

          {activeSection === 'catering' && demoRole === 'Catering Staff' && (
            <section className="workspace-page" aria-labelledby="catering-heading">
              <div className="page-heading">
                <div><span className="page-kicker">CATERING OPERATIONS</span><h1 id="catering-heading">Catering</h1><p>Actionable current selections and request records for this illustrative flight.</p></div>
              </div>
              <section className="catering-overview-card">
                <div className="dashboard-card-heading">
                  <div><span className="page-kicker">KITCHEN PREPARATION SUMMARY</span><h2>Current passenger selections</h2></div>
                  <span className="kitchen-status-chip">NOT CONFIRMED ORDERS</span>
                </div>
                <p className="dashboard-footnote">Current shared selections only. Counts are not confirmed kitchen orders, preparation, or delivery. No passenger names or individual records are shown here.</p>
                <div className="kitchen-operational-status" aria-label="Operational status">
                  <div>
                    <span>Selection status</span>
                    <strong>Current passenger preferences</strong>
                  </div>
                  <div>
                    <span>Outstanding requests</span>
                    <strong>{outstandingKitchenRequestCount} pending review</strong>
                  </div>
                  <div>
                    <span>Meal not selected</span>
                    <strong>{unselectedMealPassengerCount} {unselectedMealPassengerCount === 1 ? 'passenger' : 'passengers'}</strong>
                  </div>
                  <div>
                    <span>Approved Express Swaps</span>
                    <strong>{approvedExpressSwapCount} reflected in current selections</strong>
                  </div>
                  <div>
                    <span>Allergy status</span>
                    <strong>{affectedPassengerIds.size ? 'Pending staff review' : 'No declarations recorded'}</strong>
                  </div>
                  <div>
                    <span>Local demo checklist</span>
                    <strong>{locallyCheckedTaskCount} of {kitchenChecklistItems.length} checked off</strong>
                  </div>
                </div>
                <section className="catering-summary-section" aria-labelledby="estimated-preparation-heading">
                  <div className="forecast-section-heading">
                    <div>
                      <h3 id="estimated-preparation-heading">Estimated preparation plan</h3>
                      <p>Rules-based estimate from current demo selections, not verified bookings or guaranteed demand.</p>
                    </div>
                    <div className="forecast-buffer-control">
                      <label htmlFor="forecast-buffer-percent">Preparation buffer</label>
                      <select
                        id="forecast-buffer-percent"
                        className="meal-input"
                        value={forecastBufferPercent}
                        onChange={(event) =>
                          setForecastBufferPercent(Number(event.target.value))
                        }
                      >
                        {[3, 4, 5].map((percent) => (
                          <option key={percent} value={percent}>{percent}%</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="forecast-estimate-note">
                    Additional buffer is calculated as the selected demand multiplied by the chosen percentage, rounded up. Suggested quantities are estimates only, not actual orders or confirmed catering requirements.
                  </p>
                  <div className="forecast-meal-list">
                    {forecastPreparationItems.map(({
                      meal,
                      selectedDemand,
                      bufferQuantity,
                      suggestedQuantity,
                    }) => (
                      <article className="forecast-meal-row" key={meal.id}>
                        <strong className="forecast-meal-name">{meal.name}</strong>
                        <div>
                          <span>Current selections</span>
                          <strong>{selectedDemand}</strong>
                        </div>
                        <div>
                          <span>Additional buffer</span>
                          <strong>{bufferQuantity}</strong>
                        </div>
                        <div className="forecast-suggested-quantity">
                          <span>Suggested quantity</span>
                          <strong>{suggestedQuantity}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className="forecast-unselected-note">
                    {unselectedMealPassengerCount} {unselectedMealPassengerCount === 1 ? 'passenger has' : 'passengers have'} no valid meal selected. Their preferences are unknown and they are excluded from this forecast.
                  </p>
                </section>
                <section className="catering-summary-section" aria-labelledby="catering-meal-types">
                  <h3 id="catering-meal-types">Meal preparation counts and reminders</h3>
                  <p className="kitchen-preparation-intro">
                    Quantities below reflect current passenger selections, including approved demo meal changes. Pending, rejected, and expired requests do not change the meal count.
                  </p>
                  {unselectedMealPassengerCount > 0 && (
                    <p className="kitchen-unselected-note">
                      {unselectedMealPassengerCount} {unselectedMealPassengerCount === 1 ? 'passenger has' : 'passengers have'} no meal selected. They are not included in any meal quantity or preparation category.
                    </p>
                  )}
                  <div className="kitchen-preparation-list">
                    {kitchenPreparationItems.map(({ meal, categoryLabel, count, preparationReminder }) => (
                      <article className="kitchen-preparation-card" key={meal.id}>
                        <div className="kitchen-preparation-card-heading">
                          <div>
                            <span className="kitchen-category-label">{categoryLabel}</span>
                            <h4>{meal.name}</h4>
                          </div>
                          <strong>{count} {count === 1 ? 'selection' : 'selections'}</strong>
                        </div>
                        <p><strong>Catalogue description:</strong> {meal.description}</p>
                        <p className="kitchen-preparation-reminder">
                          <strong>Preparation reminder:</strong> {preparationReminder}
                        </p>
                      </article>
                    ))}
                  </div>
                  <p className="kitchen-catalogue-caution">
                    Meal names, categories, and descriptions come from the illustrative catalogue. It does not provide verified recipes, supplier details, or kitchen preparation procedures; confirm these with approved information before preparation.
                  </p>
                </section>
                <section className="catering-summary-section" aria-labelledby="catering-dietary-categories">
                  <h3 id="catering-dietary-categories">Dietary preparation categories</h3>
                  {kitchenCategoryCounts.length ? (
                    <div className="catering-summary-grid">
                      {kitchenCategoryCounts.map(({ category, label, count }) => (
                        <div className="catering-summary-item" key={category}>
                          <span>{label}</span><strong>{count} {count === 1 ? 'passenger' : 'passengers'}</strong>
                        </div>
                      ))}
                    </div>
                  ) : <p>No dietary categories recorded.</p>}
                </section>
                <section
                  className="catering-allergy-attention"
                  aria-labelledby="catering-allergy-flags"
                  aria-live="polite"
                >
                  <div className="catering-allergy-heading">
                    <div>
                      <span className="kitchen-attention-label">ALLERGY ATTENTION · STAFF REVIEW REQUIRED</span>
                      <h3 id="catering-allergy-flags">Declared allergy flags</h3>
                    </div>
                    <span className="kitchen-status-chip kitchen-review-chip">
                      {affectedPassengerIds.size ? 'PENDING REVIEW' : 'NO FLAGS DECLARED'}
                    </span>
                    </div>
                    <p className="catering-allergy-instruction">
                      Before serving, staff must verify declarations against actual ingredients, supplier information, and cross-contact controls. These declarations do not establish that any meal is allergen-free or safe.
                  </p>
                  <div className="allergy-attention-metrics">
                    <div><strong>{affectedPassengerIds.size}</strong><span>affected {affectedPassengerIds.size === 1 ? 'passenger' : 'passengers'}</span></div>
                    <div><strong>{declaredAllergyCounts.size}</strong><span>distinct allergy {declaredAllergyCounts.size === 1 ? 'type' : 'types'}</span></div>
                  </div>
                  {declaredAllergyCounts.size ? (
                      <div className="catering-summary-grid">
                        {[...declaredAllergyCounts.values()].map(({ label, count }) => (
                          <div className="catering-summary-item catering-allergy-summary-item" key={label}>
                            <span>{label}</span><strong>{count} {count === 1 ? 'passenger' : 'passengers'}</strong>
                          </div>
                        ))}
                      </div>
                  ) : <p className="catering-summary-warning">No allergy declarations are currently recorded. This is not a food-safety assessment.</p>}
                </section>
                <section className="catering-summary-section" aria-labelledby="kitchen-checklist-heading">
                  <div className="kitchen-checklist-heading">
                    <h3 id="kitchen-checklist-heading">Kitchen handoff checklist</h3>
                    <span>{locallyCheckedTaskCount}/{kitchenChecklistItems.length} locally checked</span>
                  </div>
                  <p className="kitchen-checklist-note">Local prototype tracking aid only. Checkmarks are not proof that a real kitchen completed the work or that food is safe. Relevant items reset when selections, allergy declarations, or outstanding requests change.</p>
                  <div className="kitchen-checklist">
                    {kitchenChecklistItems.map((item) => (
                      <label className="kitchen-checklist-item" key={item.id}>
                        <input
                          type="checkbox"
                          checked={kitchenChecklist[item.id]}
                          onChange={(event) =>
                            setKitchenChecklist((current) => ({
                              ...current,
                              [item.id]: event.target.checked,
                            }))
                          }
                        />
                        <span>{item.label}</span>
                        <strong>{kitchenChecklist[item.id] ? 'Locally checked' : 'Pending'}</strong>
                      </label>
                    ))}
                  </div>
                </section>
              </section>
              <CateringPriorityQueue
                requests={cateringRequests}
                departureTime={departureTime}
                onDepartureTimeChange={handleDepartureTimeChange}
                minimumLeadMinutes={minimumLeadMinutes}
                onMinimumLeadMinutesChange={setMinimumLeadMinutes}
                onStatusChange={handleRequestStatusChange}
                onExpressDecision={handleExpressMealDecision}
                privacyMode
              />
            </section>
          )}

          {activeSection === 'exchange' && (
            <section className="workspace-page">
              <div className="page-heading">
                <div><span className="page-kicker">CURRENT FLIGHT · {flightReference || 'NOT SET'}</span><h1>Meal Exchange</h1><p>Both passengers must belong to the same flight. This local prototype compares their shared booking reference; it cannot verify a real itinerary.</p></div>
                <span className="flight-chip"><i /> {flightReference || 'Flight not configured'}</span>
              </div>
              <MealExchange
                passengers={demoRole === 'Passenger'
                  ? (currentPassenger ? [currentPassenger] : [])
                  : passengers}
                flightReference={flightReference}
                offers={demoRole === 'Passenger' ? passengerExchangeOffers : exchangeOffers}
                onOffersChange={demoRole === 'Passenger'
                  ? handlePassengerExchangeOffersChange
                  : setExchangeOffers}
                canRequestOffer={demoRole === 'Passenger'
                  ? (offer, recipientId) => {
                      const offererBusy = exchangeOffers.some(
                        (candidate) =>
                          candidate.id !== offer.id &&
                          ACTIVE_EXCHANGE_STATUSES.has(candidate.status) &&
                          (candidate.passengerId === offer.passengerId ||
                            candidate.recipientId === offer.passengerId),
                      )
                      const recipientBusy = exchangeOffers.some(
                        (candidate) =>
                          ACTIVE_EXCHANGE_STATUSES.has(candidate.status) &&
                          (candidate.passengerId === recipientId ||
                            candidate.recipientId === recipientId),
                      )
                      return !offererBusy &&
                        !recipientBusy &&
                        !pendingMealPassengerIds.includes(offer.passengerId) &&
                        !pendingMealPassengerIds.includes(recipientId)
                    }
                  : undefined}
                pendingMealPassengerIds={demoRole === 'Passenger'
                  ? pendingMealPassengerIds.filter((id) => id === currentPassenger?.id)
                  : pendingMealPassengerIds}
                role={demoRole}
                selectedDemoPassengerId={currentPassenger?.id}
                onCompleteExchange={demoRole === 'Cabin Crew' ? (offer, recipientId) => {
                  if (offer.status !== 'Crew review' || offer.recipientId !== recipientId) {
                    return false
                  }
                  const recipient = passengers.find((passenger) => passenger.id === recipientId)
                  const offerer = passengers.find((passenger) => passenger.id === offer.passengerId)
                  if (
                    !recipient ||
                    !offerer ||
                    offerer.meal !== offer.mealId ||
                    recipient.meal !== offer.recipientMealId ||
                    !offer.flightReference ||
                    offer.flightReference !== flightReference.trim()
                  ) return false

                  setPassengers((current) =>
                    current.map((passenger) => {
                      if (passenger.id === offerer.id) return { ...passenger, meal: recipient.meal }
                      if (passenger.id === recipient.id) return { ...passenger, meal: offer.mealId }
                      return passenger
                    }),
                  )
                  return true
                } : undefined}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App