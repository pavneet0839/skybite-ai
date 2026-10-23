import { meals, supportedAllergens, supportedDietaryRequirements } from './meals.js'

export const APP_STORAGE_KEY = 'skybite-ai:shared-state'
export const APP_STORAGE_VERSION = 1
const DEMO_DEPARTURE_OFFSET_MS = 3 * 60 * 60 * 1000

const DEFAULT_APP_DATA = {
  passengers: [
    {
      id: 1,
      name: 'Demo Passenger 1',
      meal: 'standard',
      allergies: ['tree-nuts'],
      customAllergy: '',
      dietaryRequirements: [],
      notes: '',
    },
    {
      id: 2,
      name: 'Demo Passenger 2',
      meal: 'sattvik',
      allergies: [],
      customAllergy: '',
      dietaryRequirements: ['navratri-sattvik'],
      notes: '',
    },
    {
      id: 3,
      name: 'Demo Passenger 3',
      meal: 'jain',
      allergies: [],
      customAllergy: 'Sesame',
      dietaryRequirements: ['strict-jain'],
      notes: '',
    },
    {
      id: 4,
      name: 'Demo Passenger 4',
      meal: 'vegan',
      allergies: ['milk'],
      customAllergy: '',
      dietaryRequirements: [],
      notes: '',
    },
    {
      id: 5,
      name: 'Demo Passenger 5',
      meal: 'iftar',
      allergies: ['eggs'],
      customAllergy: '',
      dietaryRequirements: ['ramzan-iftar'],
      notes: '',
    },
  ],
  flightReference: 'SB-DEMO-001',
  minimumLeadMinutes: 30,
  forecastBufferPercent: 5,
  cateringRequests: [],
  exchangeOffers: [],
}

export function createDemoDepartureTime(now = new Date()) {
  const departure = new Date(now.getTime() + DEMO_DEPARTURE_OFFSET_MS)
  const pad = (value) => String(value).padStart(2, '0')

  return [
    departure.getFullYear(),
    '-',
    pad(departure.getMonth() + 1),
    '-',
    pad(departure.getDate()),
    'T',
    pad(departure.getHours()),
    ':',
    pad(departure.getMinutes()),
    ':',
    pad(departure.getSeconds()),
    '.',
    String(departure.getMilliseconds()).padStart(3, '0'),
  ].join('')
}

const MEAL_IDS = new Set(meals.map((meal) => meal.id))
const ALLERGEN_IDS = new Set(supportedAllergens.map((allergen) => allergen.id))
const REQUIREMENT_IDS = new Set(
  supportedDietaryRequirements.map((requirement) => requirement.id),
)

const REQUEST_FIELDS = new Set([
  'id',
  'requestType',
  'passengerId',
  'passengerName',
  'flightReference',
  'seat',
  'changeKind',
  'previousMeal',
  'previousMealId',
  'requestedMeal',
  'requestedMealId',
  'allergyChange',
  'previousAllergies',
  'updatedAllergies',
  'timestamp',
  'scheduledDepartureTime',
  'departureTimeAtSubmission',
  'timeRemainingAtSubmissionMs',
  'decisionTimeRemainingMs',
  'urgentAtReceipt',
  'priority',
  'priorityReason',
  'outcome',
  'status',
  'outcomeMessage',
  'rejectionReason',
  'statusHistory',
  'passengerNotes',
  'decidedAt',
])
const OFFER_FIELDS = new Set([
  'id',
  'passengerId',
  'mealId',
  'flightReference',
  'createdAt',
  'updatedAt',
  'status',
  'statusHistory',
  'recipientId',
  'recipientMealId',
  'requestedAt',
  'requesterAcceptedOfferedMeal',
  'offererAcceptedRecipientMeal',
  'recipientCrewReviewed',
  'offererCrewReviewed',
  'consentHistory',
  'crewReviewHistory',
  'cancellationReason',
  'completedAt',
  'finalOutcome',
])

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isString = (value) => typeof value === 'string'
const isTimestamp = (value) =>
  isString(value) && Number.isFinite(Date.parse(value))
const isOptional = (record, key, predicate) =>
  !Object.hasOwn(record, key) || predicate(record[key])
const hasOnlyFields = (record, allowedFields) =>
  Object.keys(record).every((key) => allowedFields.has(key))

function isHistory(value) {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) =>
      isRecord(entry) &&
      isString(entry.status) &&
      isTimestamp(entry.timestamp) &&
      Object.keys(entry).every((key) => key === 'status' || key === 'timestamp'),
    )
}

function isPassenger(value) {
  return isRecord(value) &&
    Object.keys(value).every((key) =>
      ['id', 'name', 'meal', 'allergies', 'customAllergy', 'dietaryRequirements', 'notes'].includes(key),
    ) &&
    Number.isInteger(value.id) &&
    value.id > 0 &&
    isString(value.name) &&
    (value.meal === null || (isString(value.meal) && MEAL_IDS.has(value.meal))) &&
    Array.isArray(value.allergies) &&
    value.allergies.every((id) => isString(id) && ALLERGEN_IDS.has(id)) &&
    isString(value.customAllergy) &&
    Array.isArray(value.dietaryRequirements) &&
    value.dietaryRequirements.every(
      (id) => isString(id) && REQUIREMENT_IDS.has(id),
    ) &&
    isString(value.notes)
}

function isCateringRequest(value) {
  return isRecord(value) &&
    hasOnlyFields(value, REQUEST_FIELDS) &&
    isString(value.id) &&
    Number.isInteger(value.passengerId) &&
    value.passengerId > 0 &&
    isTimestamp(value.timestamp) &&
    Array.isArray(value.changeKind) &&
    value.changeKind.length > 0 &&
    value.changeKind.every(isString) &&
    isString(value.status) &&
    ['submitted', 'rejected'].includes(value.outcome) &&
    isHistory(value.statusHistory) &&
    isOptional(value, 'requestType', isString) &&
    isOptional(value, 'passengerName', isString) &&
    isOptional(value, 'flightReference', isString) &&
    isOptional(value, 'seat', (item) => item === null || isString(item)) &&
    isOptional(value, 'previousMeal', isString) &&
    isOptional(value, 'previousMealId', (item) => isString(item) && MEAL_IDS.has(item)) &&
    isOptional(value, 'requestedMeal', isString) &&
    isOptional(value, 'requestedMealId', (item) => isString(item) && MEAL_IDS.has(item)) &&
    isOptional(value, 'allergyChange', (item) => typeof item === 'boolean') &&
    isOptional(value, 'previousAllergies', isString) &&
    isOptional(value, 'updatedAllergies', isString) &&
    isOptional(value, 'scheduledDepartureTime', isString) &&
    isOptional(value, 'departureTimeAtSubmission', isString) &&
    isOptional(value, 'timeRemainingAtSubmissionMs', (item) => item === null || Number.isFinite(item)) &&
    isOptional(value, 'decisionTimeRemainingMs', (item) => item === null || Number.isFinite(item)) &&
    isOptional(value, 'urgentAtReceipt', (item) => typeof item === 'boolean') &&
    isOptional(value, 'priority', isString) &&
    isOptional(value, 'priorityReason', (item) => item === null || isString(item)) &&
    isOptional(value, 'outcomeMessage', isString) &&
    isOptional(value, 'rejectionReason', (item) => item === null || isString(item)) &&
    isOptional(value, 'passengerNotes', isString) &&
    isOptional(value, 'decidedAt', isTimestamp)
}

function isConsentHistory(value) {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry) &&
    Number.isInteger(entry.passengerId) &&
    entry.passengerId > 0 &&
    isString(entry.acceptedMealId) &&
    MEAL_IDS.has(entry.acceptedMealId) &&
    typeof entry.accepted === 'boolean' &&
    isTimestamp(entry.timestamp) &&
    Object.keys(entry).every((key) =>
      ['passengerId', 'acceptedMealId', 'accepted', 'timestamp'].includes(key),
    ),
  )
}

function isCrewReviewHistory(value) {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry) &&
    Number.isInteger(entry.passengerId) &&
    entry.passengerId > 0 &&
    typeof entry.verified === 'boolean' &&
    isTimestamp(entry.timestamp) &&
    Object.keys(entry).every((key) =>
      ['passengerId', 'verified', 'timestamp'].includes(key),
    ),
  )
}

function isExchangeOffer(value) {
  return isRecord(value) &&
    hasOnlyFields(value, OFFER_FIELDS) &&
    isString(value.id) &&
    Number.isInteger(value.passengerId) &&
    value.passengerId > 0 &&
    isString(value.mealId) &&
    MEAL_IDS.has(value.mealId) &&
    isString(value.flightReference) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isString(value.status) &&
    isHistory(value.statusHistory) &&
    isOptional(value, 'recipientId', (item) => Number.isInteger(item) && item > 0) &&
    isOptional(value, 'recipientMealId', (item) => isString(item) && MEAL_IDS.has(item)) &&
    isOptional(value, 'requestedAt', isTimestamp) &&
    isOptional(value, 'requesterAcceptedOfferedMeal', (item) => typeof item === 'boolean') &&
    isOptional(value, 'offererAcceptedRecipientMeal', (item) => typeof item === 'boolean') &&
    isOptional(value, 'recipientCrewReviewed', (item) => typeof item === 'boolean') &&
    isOptional(value, 'offererCrewReviewed', (item) => typeof item === 'boolean') &&
    isOptional(value, 'consentHistory', isConsentHistory) &&
    isOptional(value, 'crewReviewHistory', isCrewReviewHistory) &&
    isOptional(value, 'cancellationReason', isString) &&
    isOptional(value, 'completedAt', isTimestamp) &&
    isOptional(value, 'finalOutcome', isString)
}

function isAppData(value) {
  return isRecord(value) &&
    Object.keys(value).every((key) =>
      ['passengers', 'flightReference', 'departureTime', 'minimumLeadMinutes', 'forecastBufferPercent', 'cateringRequests', 'exchangeOffers'].includes(key),
    ) &&
    Array.isArray(value.passengers) &&
    value.passengers.length > 0 &&
    value.passengers.length <= 6 &&
    value.passengers.every(isPassenger) &&
    new Set(value.passengers.map((passenger) => passenger.id)).size === value.passengers.length &&
    isString(value.flightReference) &&
    isString(value.departureTime) &&
    Number.isFinite(value.minimumLeadMinutes) &&
    value.minimumLeadMinutes >= 0 &&
    Array.isArray(value.cateringRequests) &&
    value.cateringRequests.every(isCateringRequest) &&
    Array.isArray(value.exchangeOffers) &&
    value.exchangeOffers.every(isExchangeOffer)
}

export function createDefaultAppData(now = new Date()) {
  return {
    ...DEFAULT_APP_DATA,
    departureTime: createDemoDepartureTime(now),
    passengers: DEFAULT_APP_DATA.passengers.map((passenger) => ({
      ...passenger,
      allergies: [...passenger.allergies],
      dietaryRequirements: [...passenger.dietaryRequirements],
    })),
    cateringRequests: [],
    exchangeOffers: [],
  }
}

export function createFirstTimePassengerDemoData(now = new Date()) {
  const data = createDefaultAppData(now)

  return {
    ...data,
    passengers: [{
      id: 1,
      name: 'Sanjeev',
      meal: null,
      allergies: [],
      customAllergy: '',
      dietaryRequirements: [],
      notes: '',
    }],
  }
}

export function loadAppData() {
  let storedValue
  try {
    storedValue = window.localStorage.getItem(APP_STORAGE_KEY)
  } catch (error) {
    console.warn('SkyBite could not access local storage; using demo defaults.', error)
    return createDefaultAppData()
  }

  if (storedValue === null) return createDefaultAppData()

  let snapshot
  try {
    snapshot = JSON.parse(storedValue)
  } catch (error) {
    console.warn('SkyBite saved data is malformed; using demo defaults.', error)
    return createDefaultAppData()
  }

  if (
    !isRecord(snapshot) ||
    snapshot.version !== APP_STORAGE_VERSION ||
    !isAppData(snapshot.data)
  ) {
    console.warn('SkyBite saved data has an unsupported version or invalid structure; using demo defaults.')
    return createDefaultAppData()
  }

  return {
    ...snapshot.data,
    forecastBufferPercent: [3, 4, 5].includes(snapshot.data.forecastBufferPercent)
      ? snapshot.data.forecastBufferPercent
      : DEFAULT_APP_DATA.forecastBufferPercent,
  }
}

export function saveAppData(data) {
  try {
    window.localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ version: APP_STORAGE_VERSION, data }),
    )
  } catch (error) {
    console.warn('SkyBite could not save shared data to local storage.', error)
  }
}
