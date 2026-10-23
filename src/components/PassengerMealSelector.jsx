
import { useEffect, useRef, useState } from 'react'
import {
  meals,
  supportedAllergens,
  supportedDietaryRequirements,
  getAllergyAssessment,
  getMealRecommendations,
} from '../data/meals.js'
import '../App.css'

function PassengerMealSelector({
  passengers,
  onPassengerUpdate,
  onPassengerChange,
  flightReference,
  onFlightReferenceChange,
  departureTime,
  minimumLeadMinutes,
  pendingMealPassengerIds,
  lockedExchangePassengerIds,
  onExpressMealRequest,
  requests = [],
  passengerMode = false,
  collapsiblePassengerCards = false,
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [rejectedMealRequests, setRejectedMealRequests] = useState({})
  const [expressMealIds, setExpressMealIds] = useState({})
  const [expressMessages, setExpressMessages] = useState({})
  const [recommendationMessages, setRecommendationMessages] = useState({})
  const customAllergyStartValues = useRef({})

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timerId)
  }, [])

  const updatePassenger = (passenger, field, value, recordChange = true) => {
    if (recordChange) {
      const result = onPassengerChange(passenger, field, value)
      if (result?.accepted === false) {
        setRejectedMealRequests((current) => ({
          ...current,
          [passenger.id]: result.message,
        }))
        return false
      }
    }
    setRejectedMealRequests((current) => {
      if (!current[passenger.id]) return current
      const next = { ...current }
      delete next[passenger.id]
      return next
    })
    onPassengerUpdate(passenger.id, field, value)
    setConfirmed(false)
    return true
  }

  const toggleAllergy = (passenger, allergenId, checked) => {
    const allergies = checked
      ? [...passenger.allergies, allergenId]
      : passenger.allergies.filter((id) => id !== allergenId)

    updatePassenger(passenger, 'allergies', allergies)
  }

  const getPassengerAssessment = (passenger, meal) => {
    const declaredAllergies = [
      ...passenger.allergies,
      ...(passenger.customAllergy.trim()
        ? [passenger.customAllergy.trim()]
        : []),
    ]

    return getAllergyAssessment(meal, declaredAllergies)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setConfirmed(true)
  }
  const departureTimestamp = departureTime
    ? new Date(departureTime).getTime()
    : Number.NaN
  const departureIsValid = Number.isFinite(departureTimestamp)
  const minutesUntilDeparture = departureIsValid
    ? (departureTimestamp - now) / 60_000
    : null
  const requestEligibility = !departureIsValid
    ? 'Set a valid departure date and time before requesting a meal change. Allergy declarations can still be submitted for staff review.'
    : minutesUntilDeparture < minimumLeadMinutes
      ? `The meal-request cutoff has passed. New meal requests require at least ${minimumLeadMinutes} minutes before departure. Allergy declarations remain available for staff review.`
      : `New meal requests can be submitted for catering confirmation until ${minimumLeadMinutes} minutes before departure. Submission does not confirm preparation or delivery.`

  return (
    <section className="meal-form" id="meal-assistant">
      <div className="form-intro">
        <span className="eyebrow">YOUR MEAL, YOUR WAY</span>
        <h2>{passengerMode ? 'Your meal, your way.' : 'Every passenger is different.'}</h2>
        <p>
          {passengerMode
            ? 'Review your meal preference and declare any allergies. This illustrative catalogue is not a substitute for ingredient verification.'
            : 'Choose a meal for each traveller and declare any allergies. We’ll check your choices against the ingredients available in this demo catalogue.'}
        </p>
        <div className="meal-cutoff-notice" role="status">
          <strong>Meal-request eligibility</strong>
          <p>{requestEligibility}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {!passengerMode && (
          <div className="form-field">
            <label className="field-label" htmlFor="flight-reference">
              Booking reference <span className="optional-label">Optional</span>
            </label>
            <input
              id="flight-reference"
              className="meal-input"
              value={flightReference}
              onChange={(event) => {
                onFlightReferenceChange(event.target.value)
                setConfirmed(false)
              }}
              placeholder="Enter your booking reference"
              autoComplete="off"
            />
          </div>
        )}

        <div className="passenger-list">
          {passengers.map((passenger, index) => {
            const selectedMeal = meals.find(
              (meal) => meal.id === passenger.meal,
            )
            const passengerMealRequests = requests
              .filter(
                (request) =>
                  request.passengerId === passenger.id &&
                  request.changeKind?.includes('meal'),
              )
              .sort(
                (left, right) =>
                  Date.parse(right.timestamp) - Date.parse(left.timestamp),
              )
            const latestMealRequest = passengerMealRequests[0]
            const expressMealId = expressMealIds[passenger.id] ?? passenger.meal
            const selectedExpressMeal = meals.find((meal) => meal.id === expressMealId)
            const dietaryRequirements = Array.isArray(passenger.dietaryRequirements)
              ? passenger.dietaryRequirements
              : []
            const mealRecommendations = getMealRecommendations(dietaryRequirements)
            const expressRequestPending = passengerMealRequests.some(
              (request) =>
                request.requestType === 'express-meal-swap' &&
                request.outcome === 'submitted' &&
                request.status === 'Pending staff review',
            )

            const assessment = selectedMeal
              ? getPassengerAssessment(passenger, selectedMeal)
              : null
            const hasDeclaredAllergies =
              passenger.allergies?.length > 0 ||
              Boolean(passenger.customAllergy?.trim())
            const hasOpenRequest =
              pendingMealPassengerIds.includes(passenger.id) ||
              expressRequestPending
            const PassengerCard = collapsiblePassengerCards
              ? 'details'
              : 'article'
            const passengerAttentionLabel = hasDeclaredAllergies
              ? 'Allergy declared · verify'
              : hasOpenRequest
                ? 'Request pending'
                : selectedMeal
                  ? 'No open attention'
                  : 'Selection needed'

            return (
              <PassengerCard
                className={`passenger-card${collapsiblePassengerCards ? ' passenger-card-collapsible' : ''}`}
                key={passenger.id}
              >
                {collapsiblePassengerCards && (
                  <summary className="passenger-card-summary">
                    <span className="passenger-card-summary-number">
                      Passenger {index + 1}
                    </span>
                    <span className="passenger-card-summary-meal">
                      {selectedMeal?.name ?? 'No meal selected'}
                    </span>
                    <span
                      className={`passenger-card-summary-attention${hasDeclaredAllergies || hasOpenRequest || !selectedMeal ? ' has-attention' : ''}`}
                    >
                      {passengerAttentionLabel}
                    </span>
                    <span className="passenger-card-summary-indicator" aria-hidden="true" />
                  </summary>
                )}
                <div className="passenger-card-content">
                <div className="passenger-heading">
                  {!passengerMode && (
                    <span className="passenger-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  )}
                  <div>
                    <h3>{passengerMode ? (passenger.name || 'Your passenger record') : `Traveller ${index + 1}`}</h3>
                    <p>Personal meal preferences</p>
                  </div>
                </div>

                <div className="form-field">
                  <label
                    className="field-label"
                    htmlFor={`passenger-name-${passenger.id}`}
                  >
                    Passenger name
                  </label>
                  <input
                    id={`passenger-name-${passenger.id}`}
                    className="meal-input"
                    value={passenger.name}
                    onChange={(event) =>
                      updatePassenger(passenger, 'name', event.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label
                    className="field-label"
                    htmlFor={`meal-${passenger.id}`}
                  >
                    {passengerMode ? 'Current meal' : 'Choose your meal'}
                  </label>
                  <select
                    id={`meal-${passenger.id}`}
                    className="meal-input"
                    value={selectedMeal?.id ?? ''}
                    disabled={
                      (passengerMode && Boolean(selectedMeal)) ||
                      pendingMealPassengerIds.includes(passenger.id) ||
                      lockedExchangePassengerIds.includes(passenger.id)
                    }
                    onChange={(event) =>
                      updatePassenger(passenger, 'meal', event.target.value)
                    }
                  >
                    <option value="" disabled>
                      No meal selected
                    </option>
                    {meals.map((meal) => {
                      const result = getPassengerAssessment(passenger, meal)

                      return (
                        <option
                          key={meal.id}
                          value={meal.id}
                          disabled={result.status === 'blocked'}
                        >
                          {meal.name}
                          {result.status === 'blocked'
                            ? ' (Allergen conflict)'
                            : result.status === 'review'
                              ? ' (Needs review)'
                              : ''}
                        </option>
                      )
                    })}
                  </select>
                  {passengerMode && (
                    <p className="field-hint">
                      {selectedMeal
                        ? 'To request a change, use Lounge-to-Gate Express Swap below. The current meal changes only after staff approval.'
                        : 'Choose your first meal here. This updates your current selection directly; later meal changes use Lounge-to-Gate Express Swap.'}
                    </p>
                  )}
                  <div
                    className={`passenger-current-selection${selectedMeal ? '' : ' is-unselected'}`}
                    role="status"
                  >
                    <span>Current selection</span>
                    <strong>{selectedMeal?.name ?? 'No meal selected'}</strong>
                    {!selectedMeal && (
                      <small className="unselected-meal-prompt">
                        Choose a meal to save this passenger’s first selection.
                      </small>
                    )}
                    {latestMealRequest && (
                      <small className={`meal-request-state${latestMealRequest.outcome === 'rejected' ? ' is-rejected' : ''}`}>
                        Latest request: {latestMealRequest.status}
                        {latestMealRequest.requestType === 'express-meal-swap'
                          ? ` · ${latestMealRequest.outcomeMessage}`
                          : latestMealRequest.outcome === 'rejected'
                            ? ' · existing selection unchanged'
                            : latestMealRequest.status === 'Ready'
                              ? ' · marked ready by demo catering workflow'
                              : latestMealRequest.status === 'Unable to fulfil'
                                ? ' · previous selection restored'
                                : ' · not yet confirmed as fulfilled'}
                      </small>
                    )}
                  </div>
                  {pendingMealPassengerIds.includes(passenger.id) && (
                    <p className="field-hint">
                      A meal request is awaiting a catering outcome. The displayed meal is a request, not confirmation of preparation or delivery.
                    </p>
                  )}
                  {passengerMode && (
                    <section className="dietary-recommendations" aria-labelledby={`recommendations-heading-${passenger.id}`}>
                      <span className="section-kicker">BASED ON YOUR DECLARATIONS</span>
                      <h4 id={`recommendations-heading-${passenger.id}`}>Possible meal matches</h4>
                      {mealRecommendations.length > 0 ? (
                        <ul className="recommendation-list">
                          {mealRecommendations.map((recommendation) => {
                            const isCurrentMeal =
                              selectedMeal?.id === recommendation.meal.id
                            const recommendationAssessment = getPassengerAssessment(
                              passenger,
                              recommendation.meal,
                            )
                            const isSelectedForSwap =
                              selectedMeal &&
                              expressMealId === recommendation.meal.id
                            const interactionLocked =
                              pendingMealPassengerIds.includes(passenger.id) ||
                              lockedExchangePassengerIds.includes(passenger.id) ||
                              expressRequestPending

                            return (
                              <li className="recommendation-card" key={`${recommendation.requirement}-${recommendation.meal.id}`}>
                                <div className="recommendation-card-heading">
                                  <span>{recommendation.requirement}</span>
                                  <strong>{recommendation.meal.name}</strong>
                                </div>
                                <p>{recommendation.reason}</p>
                                <p className="recommendation-warning">
                                  {recommendation.verificationWarning}
                                </p>
                                {recommendationAssessment.status === 'blocked' && (
                                  <p className="recommendation-allergy-warning">
                                    The existing allergy assessment flags a
                                    potential conflict. This meal is not offered
                                    as a selectable recommendation.
                                  </p>
                                )}
                                {recommendationAssessment.status === 'review' && (
                                  <p className="recommendation-warning">
                                    A declared custom allergy needs manual
                                    ingredient verification before choosing.
                                  </p>
                                )}
                                {isCurrentMeal ? (
                                  <span className="recommendation-action-state">Currently selected</span>
                                ) : (
                                  <button
                                    className="recommendation-select-button"
                                    type="button"
                                    disabled={
                                      interactionLocked ||
                                      recommendationAssessment.status === 'blocked'
                                    }
                                    onClick={() => {
                                      if (!selectedMeal) {
                                        const accepted = updatePassenger(
                                          passenger,
                                          'meal',
                                          recommendation.meal.id,
                                        )
                                        setRecommendationMessages((current) => ({
                                          ...current,
                                          [passenger.id]: accepted
                                            ? `${recommendation.meal.name} was saved as your first meal selection. This is not confirmation of preparation or dietary suitability.`
                                            : 'The first meal selection was not saved. Resolve any pending request and try again.',
                                        }))
                                        return
                                      }

                                      setExpressMealIds((current) => ({
                                        ...current,
                                        [passenger.id]: recommendation.meal.id,
                                      }))
                                      setRecommendationMessages((current) => ({
                                        ...current,
                                        [passenger.id]: isSelectedForSwap
                                          ? `${recommendation.meal.name} is already selected as the requested meal. Submit the Express Swap request below if you want staff to review it.`
                                          : `${recommendation.meal.name} is selected as the requested meal. Your current meal is unchanged; submit the Express Swap request below if you want staff to review it.`,
                                      }))
                                    }}
                                  >
                                    {selectedMeal
                                      ? isSelectedForSwap
                                        ? 'Selected for Express Swap'
                                        : 'Use in Express Swap'
                                      : 'Select as first meal'}
                                  </button>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="recommendation-empty">
                          Declare a supported dietary need below to see possible catalogue matches. Recommendations are not verified meal suitability.
                        </p>
                      )}
                      {recommendationMessages[passenger.id] && (
                        <p className="recommendation-feedback" role="status">
                          {recommendationMessages[passenger.id]}
                        </p>
                      )}
                    </section>
                  )}
                  {passengerMode && selectedMeal && (
                    <section className="express-swap-panel" aria-labelledby={`express-swap-heading-${passenger.id}`}>
                      <span className="section-kicker">LOUNGE-TO-GATE EXPRESS SWAP · LOCAL DEMO</span>
                      <h4 id={`express-swap-heading-${passenger.id}`}>Request a meal change</h4>
                      <p>Your current meal stays the same unless Catering Operations approves this request.</p>
                      <div className="express-swap-meals">
                        <div>
                          <span>Current meal</span>
                          <strong>{selectedMeal.name}</strong>
                        </div>
                        <span className="express-swap-arrow" aria-hidden="true">→</span>
                        <div>
                          <label htmlFor={`express-meal-${passenger.id}`}>Requested meal</label>
                          <select
                            id={`express-meal-${passenger.id}`}
                            className="meal-input"
                            value={expressMealId}
                            disabled={expressRequestPending || lockedExchangePassengerIds.includes(passenger.id)}
                            onChange={(event) =>
                              setExpressMealIds((current) => ({
                                ...current,
                                [passenger.id]: event.target.value,
                              }))
                            }
                          >
                            {meals.map((meal) => {
                              const result = getPassengerAssessment(passenger, meal)
                              return (
                                <option
                                  key={meal.id}
                                  value={meal.id}
                                  disabled={result.status === 'blocked'}
                                >
                                  {meal.name}
                                  {result.status === 'blocked'
                                    ? ' (Allergen conflict)'
                                    : result.status === 'review'
                                      ? ' (Needs review)'
                                      : ''}
                                </option>
                              )
                            })}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="primary-button express-swap-submit"
                        disabled={
                          !selectedExpressMeal ||
                          selectedExpressMeal.id === passenger.meal ||
                          expressRequestPending ||
                          pendingMealPassengerIds.includes(passenger.id) ||
                          lockedExchangePassengerIds.includes(passenger.id)
                        }
                        onClick={() => {
                          const result = onExpressMealRequest(passenger, expressMealId)
                          setExpressMessages((current) => ({
                            ...current,
                            [passenger.id]: {
                              accepted: result.accepted,
                              message: result.message,
                            },
                          }))
                        }}
                      >
                        Request meal change
                      </button>
                      {expressMessages[passenger.id] && (
                        <p
                          className={`express-swap-feedback${expressMessages[passenger.id].accepted ? ' is-success' : ' is-error'}`}
                          role={expressMessages[passenger.id].accepted ? 'status' : 'alert'}
                        >
                          {expressMessages[passenger.id].message}
                        </p>
                      )}
                      {expressRequestPending && (
                        <p className="express-swap-feedback" role="status">
                          Request received · pending staff review. The current meal has not changed.
                        </p>
                      )}
                      <p className="express-swap-footnote">
                        Requests use the configured departure cutoff shown above. Allergy and essential dietary declarations remain available independently of meal-change eligibility. Approval does not confirm preparation or delivery.
                      </p>
                    </section>
                  )}
                  {lockedExchangePassengerIds.includes(passenger.id) &&
                    !pendingMealPassengerIds.includes(passenger.id) && (
                      <p className="field-hint">
                        Meal changes are paused while this passenger participates
                        in an active exchange.
                      </p>
                    )}
                  {rejectedMealRequests[passenger.id] && (
                    <div className="meal-request-rejection" role="alert">
                      <p>{rejectedMealRequests[passenger.id]}</p>
                      <button
                        type="button"
                        className="rejection-dismiss"
                        onClick={() =>
                          setRejectedMealRequests((current) => {
                            const next = { ...current }
                            delete next[passenger.id]
                            return next
                          })
                        }
                      >
                        Keep existing meal selection
                      </button>
                    </div>
                  )}
                </div>

                <div className="dietary-requirement-section">
                  <p className="field-label">Declared dietary requirements</p>
                  <p className="field-hint">
                    Select requirements that apply. These declarations guide possible matches; they do not verify recipe suitability.
                  </p>
                  <div className="allergy-options">
                    {supportedDietaryRequirements.map((requirement) => (
                      <label className="allergy-option" key={requirement.id}>
                        <input
                          type="checkbox"
                          checked={dietaryRequirements.includes(requirement.id)}
                          onChange={(event) => {
                            const nextRequirements = event.target.checked
                              ? [...dietaryRequirements, requirement.id]
                              : dietaryRequirements.filter(
                                  (id) => id !== requirement.id,
                                )
                            updatePassenger(
                              passenger,
                              'dietaryRequirements',
                              nextRequirements,
                            )
                          }}
                        />
                        <span>{requirement.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="allergy-section">
                  <p className="field-label">
                    Do you have any of these allergies?
                  </p>
                  <p className="field-hint">
                    Select every allergy that applies to this traveller.
                  </p>

                  <div className="allergy-options">
                    {supportedAllergens.map((allergen) => (
                      <label
                        className="allergy-option"
                        key={allergen.id}
                      >
                        <input
                          type="checkbox"
                          checked={passenger.allergies.includes(allergen.id)}
                          onChange={(event) =>
                            toggleAllergy(
                              passenger,
                              allergen.id,
                              event.target.checked,
                            )
                          }
                        />
                        <span>{allergen.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <label
                    className="field-label"
                    htmlFor={`custom-allergy-${passenger.id}`}
                  >
                    Other allergies
                    <span className="optional-label">If applicable</span>
                  </label>
                  <input
                    id={`custom-allergy-${passenger.id}`}
                    className="meal-input"
                    value={passenger.customAllergy}
                    onFocus={() => {
                      customAllergyStartValues.current[passenger.id] =
                        passenger.customAllergy
                    }}
                    onBlur={(event) => {
                      const previousValue =
                        customAllergyStartValues.current[passenger.id] ??
                        passenger.customAllergy
                      onPassengerChange(
                        { ...passenger, customAllergy: previousValue },
                        'customAllergy',
                        event.currentTarget.value,
                      )
                      delete customAllergyStartValues.current[passenger.id]
                    }}
                    onChange={(event) =>
                      updatePassenger(
                        passenger,
                        'customAllergy',
                        event.target.value,
                        false,
                      )
                    }
                    placeholder="e.g. mustard, coconut, specific ingredient"
                  />
                  <p className="field-hint">
                    Custom allergies require manual verification. A missing
                    ingredient match does not mean the meal is safe.
                  </p>
                </div>

                {assessment ? (
                  <>
                    <div className={`allergy-assessment assessment-${assessment.status}`}>
                      <div className="assessment-heading">
                        <span className="assessment-indicator" aria-hidden="true" />
                        <strong>
                          {assessment.status === 'blocked'
                            ? 'BLOCKED · Allergen conflict found'
                            : assessment.status === 'review'
                              ? 'REVIEW · Manual verification required'
                              : 'NO KNOWN MATCH · Check before ordering'}
                        </strong>
                      </div>

                      {assessment.status === 'blocked' && (
                        <p>
                          The available data identifies a potential conflict with
                          this traveller’s declared allergies. Choose another meal.
                        </p>
                      )}

                      {assessment.status === 'review' && (
                        <p>
                          The declared allergy cannot be reliably cleared using
                          this demo’s ingredient data. Ask the airline to verify
                          the complete recipe and preparation conditions.
                        </p>
                      )}

                      {assessment.status === 'clear' && (
                        <p>
                          No declared allergy matched the available data. This is
                          not confirmation that the meal is allergen-free.
                        </p>
                      )}
                    </div>

                    <details className="ingredient-details">
                      <summary>View ingredients and meal details</summary>
                      <p>{selectedMeal.description}</p>
                      <p className="ingredient-label">Listed ingredients</p>
                      <ul>
                        {selectedMeal.ingredients.map((ingredient) => (
                          <li key={ingredient}>{ingredient}</li>
                        ))}
                      </ul>
                      <p className="ingredient-label">Recorded allergens</p>
                      <p>
                        {selectedMeal.allergens.length
                          ? selectedMeal.allergens
                              .map((id) =>
                                supportedAllergens.find(
                                  (allergen) => allergen.id === id,
                                )?.label ?? id,
                              )
                              .join(', ')
                          : 'None recorded in this illustrative catalogue.'}
                      </p>
                    </details>
                  </>
                ) : (
                  <p className="field-hint">
                    Select a meal to review its catalogue details. Allergy declarations can be entered now.
                  </p>
                )}

                <div className="form-field">
                  <label
                    className="field-label"
                    htmlFor={`notes-${passenger.id}`}
                  >
                    Additional requests
                    <span className="optional-label">Optional</span>
                  </label>
                  <textarea
                    id={`notes-${passenger.id}`}
                    className="meal-input meal-textarea"
                    value={passenger.notes}
                    onChange={(event) =>
                      updatePassenger(passenger, 'notes', event.target.value)
                    }
                    placeholder="Cultural, religious, or other meal requirements"
                    rows={3}
                  />
                </div>
                </div>
              </PassengerCard>
            )
          })}
        </div>

        <p className="form-disclaimer">
          <strong>Important:</strong> These sample meals are illustrative,
          not verified airline recipes. Ingredient lists may be incomplete
          and do not account for cross-contact during preparation. Confirm
          allergies, ingredients, and meal availability directly with the
          airline before travel. This demo does not submit a real meal order.
        </p>

        <button className="form-submit" type="submit">
          Review meal selections
        </button>
      </form>

      {confirmed && (
        <div className="confirmation-panel" role="status" aria-live="polite">
          <span className="eyebrow">SELECTION SUMMARY</span>
          <h3>Your choices are ready to review.</h3>
          <p>
            {flightReference.trim()
              ? `Booking reference: ${flightReference.trim()}`
              : 'No booking reference provided.'}
          </p>

          {passengers.map((passenger) => {
            const meal = meals.find((item) => item.id === passenger.meal)
            const assessment = meal
              ? getPassengerAssessment(passenger, meal)
              : null

            return (
              <div className="confirmation-row" key={passenger.id}>
                <div>
                  <strong>{passenger.name || 'Unnamed passenger'}</strong>
                  <p>{meal?.name ?? 'No meal selected'}</p>
                </div>
                <span>
                  {assessment?.status === 'blocked'
                    ? 'Blocked'
                    : assessment?.status === 'review'
                      ? 'Needs review'
                      : 'Verify before ordering'}
                </span>
              </div>
            )
          })}

          <p className="confirmation-note">
            This is a local demonstration only. No airline or catering system
            has received these selections.
          </p>
        </div>
      )}
    </section>
  )
}

export default PassengerMealSelector
