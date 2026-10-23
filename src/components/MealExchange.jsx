import { useState } from 'react'
import { allergenAliases, meals, supportedAllergens } from '../data/meals.js'
import '../App.css'

const ACTIVE_STATUSES = new Set(['Available', 'Requested', 'Crew review'])

const normalize = (value) =>
  value.trim().toLowerCase().replace(/[-_]/g, ' ')

function getMeal(mealId) {
  return meals.find((meal) => meal.id === mealId)
}

function getAllergyAssessment(passenger, meal) {
  if (!passenger || !meal) return { blocked: false, review: true, reason: 'Meal details are unavailable.' }

  const ingredients = Array.isArray(meal.ingredients)
    ? meal.ingredients.map(normalize)
    : []
  const declaredIds = passenger.allergies ?? []
  const knownConflicts = declaredIds.filter((id) => {
    const aliasKey = id.replace(/-/g, ' ')
    const aliases = allergenAliases[aliasKey] ?? [aliasKey]
    return meal.allergens?.includes(id) ||
      aliases.some((alias) => ingredients.some((ingredient) =>
        ingredient.includes(normalize(alias)),
      ))
  })
  const customAllergies = (passenger.customAllergy ?? '')
    .split(/[,;]/)
    .map((allergy) => normalize(allergy))
    .filter(Boolean)
  const customConflict = customAllergies.some((allergy) => {
    const matchingAliases = Object.values(allergenAliases)
      .flat()
      .filter((alias) =>
        normalize(alias).includes(allergy) || allergy.includes(normalize(alias)),
      )
    const searchTerms = [allergy, ...matchingAliases.map(normalize)]
    return searchTerms.some((term) =>
      ingredients.some((ingredient) => ingredient.includes(term)),
    )
  })

  if (knownConflicts.length || customConflict) {
    return {
      blocked: true,
      review: false,
      reason: 'A declared allergy matches the listed allergens or ingredients.',
    }
  }

  const hasDeclaredAllergies = declaredIds.length > 0 || customAllergies.length > 0
  const incompleteData = meal.ingredientDataVerified !== true

  return {
    blocked: false,
    review: hasDeclaredAllergies && incompleteData,
    reason: hasDeclaredAllergies && incompleteData
      ? 'The prototype ingredient list is illustrative and unverified. Crew must verify the approved recipe and cross-contact information before completion.'
      : 'No known match in the illustrative data. This is not a food-safety determination.',
  }
}

function recordTransition(offer, status, changes = {}) {
  const timestamp = new Date().toISOString()
  return {
    ...offer,
    ...changes,
    status,
    updatedAt: timestamp,
    statusHistory: [
      ...offer.statusHistory,
      { status, timestamp },
    ],
  }
}

function MealDetails({ meal }) {
  if (!meal) return <p>Meal details are unavailable.</p>
  const allergenLabels = (meal.allergens ?? []).map(
    (id) => supportedAllergens.find((allergen) => allergen.id === id)?.label ?? id,
  )

  return (
    <details className="exchange-meal-details">
      <summary>
        {meal.name} · {meal.category}
      </summary>
      <p>{meal.description}</p>
      <p><strong>Listed ingredients:</strong> {(meal.ingredients ?? []).join(', ') || 'Not listed'}</p>
      <p><strong>Recorded allergens:</strong> {allergenLabels.join(', ') || 'None recorded'}</p>
      <p className="exchange-safety-note">
        Illustrative catalogue only; ingredients and allergen information are
        not verified airline recipes. Confirm the full recipe and cross-contact
        controls with approved catering information.
      </p>
    </details>
  )
}

function MealExchange({
  passengers,
  flightReference,
  offers,
  onOffersChange,
  pendingMealPassengerIds,
  onCompleteExchange,
  canRequestOffer,
  role = 'Cabin Crew',
  selectedDemoPassengerId,
}) {
  const [selectedPassengerId, setSelectedPassengerId] = useState('')
  const [exchangeMessage, setExchangeMessage] = useState('')
  const [offerConfirmation, setOfferConfirmation] = useState(false)
  const passengerMode = role === 'Passenger'
  const crewMode = role === 'Cabin Crew'

  const selectedPassenger = passengers.find(
    (passenger) =>
      String(passenger.id) === String(
        passengerMode ? selectedDemoPassengerId : selectedPassengerId,
      ),
  ) ?? passengers[0]
  const currentFlight = flightReference.trim()

  const isParticipantInActiveExchange = (passengerId, exceptOfferId) =>
    offers.some((offer) =>
      offer.id !== exceptOfferId &&
      ACTIVE_STATUSES.has(offer.status) &&
      (offer.passengerId === passengerId || offer.recipientId === passengerId),
    )

  const handleCreateOffer = () => {
    if (!offerConfirmation) {
      setExchangeMessage('Confirm that the existing pre-ordered meal is available and unserved before offering it.')
      return
    }
    if (!selectedPassenger?.meal) {
      setExchangeMessage('Select a current passenger meal before offering it.')
      return
    }
    if (!currentFlight) {
      setExchangeMessage('Enter the booking reference before creating an exchange offer. The prototype cannot verify a shared flight without it.')
      return
    }
    if (isParticipantInActiveExchange(selectedPassenger.id)) {
      setExchangeMessage('This passenger is already participating in an unresolved exchange.')
      return
    }
    if (pendingMealPassengerIds.includes(selectedPassenger.id)) {
      setExchangeMessage('Wait for the passenger’s pending catering request to resolve before offering a meal.')
      return
    }

    const timestamp = new Date().toISOString()
    const offer = {
      id: crypto.randomUUID(),
      passengerId: selectedPassenger.id,
      mealId: selectedPassenger.meal,
      flightReference: currentFlight,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'Available',
      statusHistory: [{ status: 'Available', timestamp }],
    }
    onOffersChange((current) => [offer, ...current])
    setOfferConfirmation(false)
    setExchangeMessage('Offer created for the passenger’s existing meal. No additional catering inventory was created.')
  }

  const handleCancel = (offer) => {
    if (
      !ACTIVE_STATUSES.has(offer.status) ||
      offer.passengerId !== selectedPassenger?.id
    ) return
    onOffersChange((current) =>
      current.map((item) =>
        item.id === offer.id
          ? recordTransition(item, 'Cancelled', {
              cancellationReason: 'Cancelled by the offering passenger.',
            })
          : item,
      ),
    )
    setExchangeMessage('Offer cancelled. It remains visible in exchange history.')
  }

  const handleRequest = (offer) => {
    if (offer.status !== 'Available') return
    if (!currentFlight || offer.flightReference !== currentFlight) {
      setExchangeMessage('This offer cannot be requested: the booking reference must match the offer’s flight.')
      return
    }
    if (offer.passengerId === selectedPassenger?.id) {
      setExchangeMessage('A passenger cannot request their own offer.')
      return
    }
    if (
      !selectedPassenger ||
      pendingMealPassengerIds.includes(selectedPassenger.id) ||
      pendingMealPassengerIds.includes(offer.passengerId) ||
      isParticipantInActiveExchange(selectedPassenger.id) ||
      isParticipantInActiveExchange(offer.passengerId, offer.id)
    ) {
      setExchangeMessage('One of these passengers is already participating in an unresolved exchange.')
      return
    }
    if (canRequestOffer && !canRequestOffer(offer, selectedPassenger.id)) {
      setExchangeMessage('This offer cannot be requested while either passenger has another active catering or exchange action.')
      return
    }

    const offeredMeal = getMeal(offer.mealId)
    const assessment = getAllergyAssessment(selectedPassenger, offeredMeal)
    if (assessment.blocked) {
      setExchangeMessage(`This meal cannot be requested for the selected recipient. ${assessment.reason}`)
      return
    }

    const timestamp = new Date().toISOString()
    onOffersChange((current) =>
      current.map((item) =>
        item.id === offer.id
          ? recordTransition(item, 'Requested', {
              recipientId: selectedPassenger.id,
              recipientMealId: selectedPassenger.meal,
              requestedAt: timestamp,
              requesterAcceptedOfferedMeal: false,
              offererAcceptedRecipientMeal: false,
              recipientCrewReviewed: false,
              offererCrewReviewed: false,
            })
          : item,
      ),
    )
    setExchangeMessage('Exchange request recorded. Both passengers must accept the actual meal details, then crew review is required.')
  }

  const handleAcceptMeal = (offer, role, checked) => {
    const key = role === 'recipient'
      ? 'requesterAcceptedOfferedMeal'
      : 'offererAcceptedRecipientMeal'
    onOffersChange((current) =>
      current.map((item) =>
        item.id === offer.id
          ? {
              ...item,
              [key]: checked,
              updatedAt: new Date().toISOString(),
              consentHistory: [
                ...(item.consentHistory ?? []),
                {
                  passengerId: role === 'recipient'
                    ? item.recipientId
                    : item.passengerId,
                  acceptedMealId: role === 'recipient'
                    ? item.mealId
                    : item.recipientMealId,
                  accepted: checked,
                  timestamp: new Date().toISOString(),
                },
              ],
            }
          : item,
      ),
    )
  }

  const handleStartCrewReview = (offer) => {
    const recipient = passengers.find(
      (passenger) => passenger.id === offer.recipientId,
    )
    const offerer = passengers.find(
      (passenger) => passenger.id === offer.passengerId,
    )
    if (!recipient || !offerer) return

    const offeredMealCheck = getAllergyAssessment(
      recipient,
      getMeal(offer.mealId),
    )
    const returnMealCheck = getAllergyAssessment(
      offerer,
      getMeal(offer.recipientMealId),
    )
    if (offeredMealCheck.blocked || returnMealCheck.blocked) {
      setExchangeMessage('Crew review cannot proceed to completion: a known allergen conflict exists. Select a different exchange.')
      return
    }

    if (
      !offer.requesterAcceptedOfferedMeal ||
      !offer.offererAcceptedRecipientMeal
    ) return

    onOffersChange((current) =>
      current.map((item) =>
        item.id === offer.id
          ? recordTransition(item, 'Crew review')
          : item,
      ),
    )
    setExchangeMessage('Crew review started. Completion remains locked until crew approval and required allergy checks are recorded.')
  }

  const handleCrewReview = (offer, role, checked) => {
    const key = role === 'recipient'
      ? 'recipientCrewReviewed'
      : 'offererCrewReviewed'
    onOffersChange((current) =>
      current.map((item) =>
        item.id === offer.id
          ? {
              ...item,
              [key]: checked,
              updatedAt: new Date().toISOString(),
              crewReviewHistory: [
                ...(item.crewReviewHistory ?? []),
                {
                  passengerId: role === 'recipient'
                    ? item.recipientId
                    : item.passengerId,
                  verified: checked,
                  timestamp: new Date().toISOString(),
                },
              ],
            }
          : item,
      ),
    )
  }

  const handleComplete = (offer) => {
    const recipient = passengers.find(
      (passenger) => passenger.id === offer.recipientId,
    )
    const offerer = passengers.find(
      (passenger) => passenger.id === offer.passengerId,
    )
    if (
      offer.status !== 'Crew review' ||
      !recipient ||
      !offerer ||
      !offer.requesterAcceptedOfferedMeal ||
      !offer.offererAcceptedRecipientMeal
    ) return

    const incomingForRecipient = getAllergyAssessment(
      recipient,
      getMeal(offer.mealId),
    )
    const incomingForOfferer = getAllergyAssessment(
      offerer,
      getMeal(offer.recipientMealId),
    )
    if (incomingForRecipient.blocked || incomingForOfferer.blocked) {
      setExchangeMessage('Completion blocked: a known allergen conflict exists.')
      return
    }
    if (
      (incomingForRecipient.review && !offer.recipientCrewReviewed) ||
      (incomingForOfferer.review && !offer.offererCrewReviewed)
    ) {
      setExchangeMessage('Completion blocked: unresolved allergy information requires crew verification.')
      return
    }

    const completed = onCompleteExchange(offer, recipient.id)
    if (!completed) {
      setExchangeMessage('Completion blocked because passenger or meal records no longer match this offer.')
      return
    }

    onOffersChange((current) =>
      current.map((item) =>
        item.id === offer.id
          ? recordTransition(item, 'Completed', {
              completedAt: new Date().toISOString(),
              finalOutcome: `${offerer.name || 'Offerer'} received ${getMeal(offer.recipientMealId)?.name ?? 'the exchanged meal'}; ${recipient.name || 'Recipient'} received ${getMeal(offer.mealId)?.name ?? 'the offered meal'}.`,
            })
          : item,
      ),
    )
    setExchangeMessage('Exchange completed by crew review. The two existing meal assignments were swapped; no meal was added to inventory.')
  }

  const availableOffers = offers.filter((offer) => offer.status === 'Available')
  const activeOffers = offers.filter((offer) =>
    ['Requested', 'Crew review'].includes(offer.status) &&
    (!passengerMode ||
      offer.passengerId === selectedPassenger?.id ||
      offer.recipientId === selectedPassenger?.id),
  )
  const history = offers.filter((offer) =>
    ['Completed', 'Cancelled'].includes(offer.status) &&
    (!passengerMode ||
      offer.passengerId === selectedPassenger?.id ||
      offer.recipientId === selectedPassenger?.id),
  )

  return (
    <section className="meal-exchange-section" id="meal-exchange">
      <div className="exchange-intro">
        <span className="section-kicker">PASSENGER MEAL EXCHANGE · LOCAL PROTOTYPE</span>
        <h2>Offer an existing meal for exchange.</h2>
        <p>
          Exchange only swaps two passengers’ existing pre-ordered meal
          assignments. It does not create catering inventory. No real seats
          are assigned in this workflow.
        </p>
        <p className="exchange-flight-help">
          Current flight: <strong>{currentFlight || 'Not provided'}</strong>.
          Both passengers must share this flight reference; this demo compares
          the reference but cannot verify a real itinerary.
        </p>
        <ol className="exchange-steps" aria-label="How meal exchange works">
          <li>
            <span>01</span>
            <div><strong>Choose the same flight</strong><p>Offers are matched against the shared demo booking reference.</p></div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Offer an existing meal</strong>
              <p>
                Confirm the pre-ordered meal is available and unserved.
                {passengerMode && ' Select the relevant demo member in Passengers first.'}
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div><strong>Review and request</strong><p>Check listed ingredients and allergens; both participants must accept the actual meal details.</p></div>
          </li>
          <li>
            <span>04</span>
            <div><strong>Crew confirms the exchange</strong><p>Completion stays pending until crew review; the two existing meal assignments are swapped.</p></div>
          </li>
        </ol>
      </div>

      <div className="exchange-actor-controls">
        {passengerMode ? (
          <p>Acting as your selected demo passenger record.</p>
        ) : (
          <>
            <label htmlFor="exchange-passenger">Acting passenger</label>
            <select
              id="exchange-passenger"
              className="meal-input"
              value={selectedPassenger ? String(selectedPassenger.id) : ''}
              onChange={(event) => {
                setSelectedPassengerId(event.target.value)
                setOfferConfirmation(false)
              }}
              disabled={!passengers.length}
            >
              {passengers.map((passenger) => (
                <option key={passenger.id} value={passenger.id}>
                  {passenger.name || 'Unnamed passenger'}
                </option>
              ))}
            </select>
          </>
        )}
        <p>Current flight reference: {currentFlight || 'Not provided; offers and requests are disabled.'}</p>
      </div>

      <label className="exchange-offer-confirmation">
        <input
          type="checkbox"
          checked={offerConfirmation}
          onChange={(event) => setOfferConfirmation(event.target.checked)}
        />
        I confirm this is my existing pre-ordered meal and it is available and unserved.
      </label>
      <button
        type="button"
        className="primary-button exchange-create-button"
        onClick={handleCreateOffer}
        disabled={
          !selectedPassenger ||
          !currentFlight ||
          !offerConfirmation ||
          pendingMealPassengerIds.includes(selectedPassenger.id) ||
          isParticipantInActiveExchange(selectedPassenger.id)
        }
      >
        Offer my existing meal
      </button>

      {exchangeMessage && (
        <p className="exchange-feedback" role="status">{exchangeMessage}</p>
      )}

      <div className="exchange-grid">
        <section className="exchange-list" aria-labelledby="available-offers-heading">
          <div className="exchange-list-heading">
            <h3 id="available-offers-heading">Available offers</h3>
            <span>{availableOffers.length}</span>
          </div>
          {availableOffers.map((offer) => {
            const meal = getMeal(offer.mealId)
            const assessment = getAllergyAssessment(selectedPassenger, meal)
            const cannotRequest =
              !currentFlight ||
              offer.flightReference !== currentFlight ||
              offer.passengerId === selectedPassenger?.id ||
              !selectedPassenger ||
              pendingMealPassengerIds.includes(selectedPassenger.id) ||
              pendingMealPassengerIds.includes(offer.passengerId) ||
              isParticipantInActiveExchange(selectedPassenger.id) ||
              isParticipantInActiveExchange(offer.passengerId, offer.id) ||
              assessment.blocked

            return (
              <article className="exchange-offer-card" key={offer.id}>
                <span className="exchange-status exchange-status-available">Available</span>
                {offer.passengerId === selectedPassenger?.id && (
                  <p>This is your offer.</p>
                )}
                <p>Flight reference: {offer.flightReference}</p>
                {!passengerMode && <p>Offer ID: {offer.id}</p>}
                <MealDetails meal={meal} />
                {assessment.blocked && (
                  <p className="exchange-safety-block" role="alert">
                    Known allergen conflict: {assessment.reason}
                  </p>
                )}
                {assessment.review && (
                  <p className="exchange-safety-review" role="note">
                    Allergy review required before completion: {assessment.reason}
                  </p>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleRequest(offer)}
                  disabled={cannotRequest}
                >
                  Request this meal in exchange
                </button>
                {offer.passengerId === selectedPassenger?.id && (
                  <button
                    type="button"
                    className="exchange-cancel-button"
                    onClick={() => handleCancel(offer)}
                  >
                    Cancel my offer
                  </button>
                )}
              </article>
            )
          })}
          {!availableOffers.length && (
            <p className="exchange-empty">No available meal offers.</p>
          )}
        </section>

        <section className="exchange-list" aria-labelledby="exchange-review-heading">
          <div className="exchange-list-heading">
            <h3 id="exchange-review-heading">Requests and crew review</h3>
            <span>{activeOffers.length}</span>
          </div>
          {activeOffers.map((offer) => {
            const offerer = passengers.find(
              (passenger) => passenger.id === offer.passengerId,
            )
            const recipient = passengers.find(
              (passenger) => passenger.id === offer.recipientId,
            )
            const offeredMeal = getMeal(offer.mealId)
            const returnMeal = getMeal(offer.recipientMealId)
            const recipientCheck = getAllergyAssessment(recipient, offeredMeal)
            const offererCheck = getAllergyAssessment(offerer, returnMeal)
            const isOfferer = selectedPassenger?.id === offer.passengerId
            const isRecipient = selectedPassenger?.id === offer.recipientId
            const allergyBlocked = recipientCheck.blocked || offererCheck.blocked

            return (
              <article className="exchange-offer-card" key={offer.id}>
                <span className={`exchange-status exchange-status-${offer.status.toLowerCase().replace(' ', '-')}`}>
                  {offer.status}
                </span>
                <p>Flight reference: {offer.flightReference}</p>
                <p>
                  {passengerMode
                    ? 'This exchange involves your selected passenger record.'
                    : `Meal exchange is between ${offerer?.name || 'offerer'} and ${recipient?.name || 'recipient'}.`}
                </p>
                <div className="exchange-two-meals">
                  <div>
                    <strong>Recipient would receive</strong>
                    <MealDetails meal={offeredMeal} />
                    {recipientCheck.blocked && <p className="exchange-safety-block">Known allergen conflict: {recipientCheck.reason}</p>}
                    {recipientCheck.review && <p className="exchange-safety-review">{recipientCheck.reason}</p>}
                  </div>
                  <div>
                    <strong>Offerer would receive</strong>
                    <MealDetails meal={returnMeal} />
                    {offererCheck.blocked && <p className="exchange-safety-block">Known allergen conflict: {offererCheck.reason}</p>}
                    {offererCheck.review && <p className="exchange-safety-review">{offererCheck.reason}</p>}
                  </div>
                </div>

                {offer.status === 'Requested' && (
                  <div className="exchange-consent-controls">
                    {isRecipient && (
                      <label>
                        <input
                          type="checkbox"
                          checked={offer.requesterAcceptedOfferedMeal}
                          onChange={(event) =>
                            handleAcceptMeal(offer, 'recipient', event.target.checked)
                          }
                        />
                        I have reviewed and accept the offered meal’s actual dietary details.
                      </label>
                    )}
                    {isOfferer && (
                      <label>
                        <input
                          type="checkbox"
                          checked={offer.offererAcceptedRecipientMeal}
                          onChange={(event) =>
                            handleAcceptMeal(offer, 'offerer', event.target.checked)
                          }
                        />
                        I have reviewed and accept the recipient’s meal I would receive.
                      </label>
                    )}
                    {offer.requesterAcceptedOfferedMeal &&
                      offer.offererAcceptedRecipientMeal && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleStartCrewReview(offer)}
                          disabled={allergyBlocked}
                        >
                          Send to crew review
                        </button>
                      )}
                  </div>
                )}

                {offer.status === 'Crew review' && crewMode && (
                  <div className="exchange-crew-controls">
                    <p>CREW REVIEW · prototype control (no sign-in or authorization)</p>
                    {recipientCheck.review && (
                      <label>
                        <input
                          type="checkbox"
                          checked={offer.recipientCrewReviewed}
                          onChange={(event) =>
                            handleCrewReview(offer, 'recipient', event.target.checked)
                          }
                        />
                        Recipient meal verified against approved recipe and cross-contact information.
                      </label>
                    )}
                    {offererCheck.review && (
                      <label>
                        <input
                          type="checkbox"
                          checked={offer.offererCrewReviewed}
                          onChange={(event) =>
                            handleCrewReview(offer, 'offerer', event.target.checked)
                          }
                        />
                        Offerer’s incoming meal verified against approved recipe and cross-contact information.
                      </label>
                    )}
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleComplete(offer)}
                      disabled={
                        allergyBlocked ||
                        (recipientCheck.review && !offer.recipientCrewReviewed) ||
                        (offererCheck.review && !offer.offererCrewReviewed)
                      }
                    >
                      Crew approve and complete exchange
                    </button>
                  </div>
                )}

                {isOfferer && ACTIVE_STATUSES.has(offer.status) && (
                  <button
                    type="button"
                    className="exchange-cancel-button"
                    onClick={() => handleCancel(offer)}
                  >
                    Cancel my offer
                  </button>
                )}
                <p className="exchange-history-meta">
                  Offer created: {new Date(offer.createdAt).toLocaleString()}
                  {offer.requestedAt && ` · Requested: ${new Date(offer.requestedAt).toLocaleString()}`}
                </p>
              </article>
            )
          })}
          {!activeOffers.length && (
            <p className="exchange-empty">No meal exchange requests awaiting action.</p>
          )}
        </section>
      </div>

      <section className="exchange-list exchange-history-list" aria-labelledby="exchange-history-heading">
        <div className="exchange-list-heading">
          <h3 id="exchange-history-heading">Completed and cancelled history</h3>
          <span>{history.length}</span>
        </div>
        {history.map((offer) => (
          <article className="exchange-offer-card" key={offer.id}>
            <span className={`exchange-status exchange-status-${offer.status.toLowerCase()}`}>
              {offer.status}
            </span>
            <p>Flight reference: {offer.flightReference}</p>
            {!passengerMode && <p>Offer ID: {offer.id}</p>}
            {offer.recipientId !== undefined && (
              <p>
                {passengerMode
                  ? 'Requested by another participant in this exchange.'
                  : `Requested by: ${passengers.find(
                      (passenger) => passenger.id === offer.recipientId,
                    )?.name ?? 'Passenger record no longer available'}`}
                {offer.requestedAt &&
                  ` · ${new Date(offer.requestedAt).toLocaleString()}`}
              </p>
            )}
            <p>
              Meal: {getMeal(offer.mealId)?.name ?? 'Unavailable'}
              {offer.recipientMealId && ` ↔ ${getMeal(offer.recipientMealId)?.name ?? 'Unavailable'}`}
            </p>
            {offer.finalOutcome && (
              <p>
                {passengerMode
                  ? 'Exchange completed; the two existing meal assignments were swapped.'
                  : offer.finalOutcome}
              </p>
            )}
            {offer.cancellationReason && <p>{offer.cancellationReason}</p>}
            {!passengerMode && offer.consentHistory?.map((entry, index) => (
              <p key={`${offer.id}-consent-${index}`}>
                Passenger {entry.passengerId} {entry.accepted ? 'accepted' : 'withdrew acceptance'} meal details at {new Date(entry.timestamp).toLocaleString()}.
              </p>
            ))}
            {!passengerMode && offer.crewReviewHistory?.map((entry, index) => (
              <p key={`${offer.id}-crew-review-${index}`}>
                Crew review {entry.verified ? 'recorded' : 'withdrawn'} at {new Date(entry.timestamp).toLocaleString()}.
              </p>
            ))}
            <ol className="exchange-transition-history">
              {offer.statusHistory.map((entry, index) => (
                <li key={`${offer.id}-${entry.status}-${index}`}>
                  {entry.status} · {new Date(entry.timestamp).toLocaleString()}
                </li>
              ))}
            </ol>
          </article>
        ))}
        {!history.length && (
          <p className="exchange-empty">
            Completed and cancelled exchanges will remain visible here.
          </p>
        )}
      </section>
      <p className="exchange-local-warning">
        This browser-only workflow does not contact caterers, verify identities,
        sync across devices, or provide authoritative food-safety verification.
      </p>
    </section>
  )
}

export default MealExchange
