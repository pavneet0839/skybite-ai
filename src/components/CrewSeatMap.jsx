import { useMemo, useState } from 'react'
import { meals, supportedAllergens } from '../data/meals.js'
import '../App.css'

const SEAT_ROWS = 6
const SEATS_PER_ROW = ['A', 'B', 'C', 'D', 'E', 'F']
const RESOLVED_REQUEST_STATUSES = new Set([
  'Ready',
  'Unable to fulfil',
  'Approved',
  'Rejected by staff',
  'Expired — cutoff',
  'Rejected — selection changed',
])

const initialAssignments = [
  { seat: '1A', passengerIndex: 0 },
  { seat: '1C', passengerIndex: 1 },
  { seat: '2D', passengerIndex: 2 },
  { seat: '3A', passengerIndex: 3 },
  { seat: '4F', passengerIndex: 4 },
  { seat: '5B', passengerIndex: 5 },
]

const getMeal = (passenger) =>
  meals.find((meal) => meal.id === passenger?.meal)

function CrewSeatMap({
  passengers = [],
  requests = [],
  departureTime,
  now,
}) {
  const [selectedPassengerId, setSelectedPassengerId] = useState(
    passengers[0]?.id ?? null,
  )
  const [reviewedPassengerIds, setReviewedPassengerIds] = useState([])

  const assignments = useMemo(
    () =>
      initialAssignments.map((assignment) => ({
        ...assignment,
        passenger: passengers[assignment.passengerIndex] ?? null,
      })),
    [passengers],
  )

  const getSeatStatus = (passenger) => {
    if (!passenger) return 'empty'
    if (
      passenger.allergies?.length > 0 ||
      passenger.customAllergy?.trim()
    ) {
      return 'allergy'
    }

    const meal = getMeal(passenger)

    if (meal?.category === 'sattvik') return 'sattvik'
    if (meal?.category === 'jain') return 'jain'

    return 'standard'
  }

  const getSeatClass = (status) => {
    const classes = {
      empty: 'crew-seat-empty',
      allergy: 'crew-seat-allergy',
      sattvik: 'crew-seat-sattvik',
      jain: 'crew-seat-jain',
      standard: 'crew-seat-standard',
    }

    return classes[status] ?? classes.empty
  }

  const focusedPassengerId =
    selectedPassengerId === null
      ? null
      : passengers.some((passenger) => passenger.id === selectedPassengerId)
        ? selectedPassengerId
        : passengers[0]?.id ?? null
  const selectedAssignment = assignments.find(
    (assignment) => assignment.passenger?.id === focusedPassengerId,
  )
  const selectedPassenger = passengers.find(
    (passenger) => passenger.id === focusedPassengerId,
  )
  const selectedMeal = selectedPassenger
    ? getMeal(selectedPassenger)
    : null

  const departureTimestamp = departureTime
    ? new Date(departureTime).getTime()
    : Number.NaN
  const unresolvedRequests = requests.filter(
    (request) =>
      request.passengerId !== undefined &&
      request.outcome === 'submitted' &&
      !RESOLVED_REQUEST_STATUSES.has(request.status),
  )
  const passengerAttention = passengers
    .map((passenger) => {
      const passengerRequests = unresolvedRequests.filter(
        (request) => request.passengerId === passenger.id,
      )
      const allergyRequest = passengerRequests.find((request) => request.allergyChange)
      const mealRequest = passengerRequests.find((request) =>
        request.changeKind?.includes('meal'),
      )
      const hasAllergy =
        passenger.allergies?.length > 0 ||
        Boolean(passenger.customAllergy?.trim())
      const hasUrgentRequest = passengerRequests.some((request) => {
        const receivedAt = Date.parse(request.timestamp)
        const urgentAtReceipt =
          Number.isFinite(departureTimestamp) &&
          Number.isFinite(receivedAt) &&
          receivedAt <= departureTimestamp &&
          departureTimestamp - receivedAt <= 60 * 60 * 1000
        const urgentNow =
          Number.isFinite(departureTimestamp) &&
          departureTimestamp >= now &&
          departureTimestamp - now <= 60 * 60 * 1000
        return urgentAtReceipt || urgentNow
      })

      return {
        passenger,
        allergyRequest,
        mealRequest,
        hasAllergy,
        hasUrgentRequest,
        priority: allergyRequest ? 4 : hasUrgentRequest ? 3 : mealRequest ? 2 : hasAllergy ? 1 : 0,
      }
    })
    .filter((item) => item.priority > 0)
    .sort((left, right) =>
      right.priority - left.priority ||
      left.passenger.name.localeCompare(right.passenger.name),
    )

  const mealCounts = passengers.reduce((counts, passenger) => {
    const meal = getMeal(passenger)
    if (meal) {
      counts[meal.name] = (counts[meal.name] ?? 0) + 1
    }
    return counts
  }, {})
  const allergyCount = passengers.filter(
    (passenger) =>
      passenger.allergies?.length > 0 ||
      Boolean(passenger.customAllergy?.trim()),
  ).length
  const passengersNeedingAttention = new Set(
    passengerAttention.map(({ passenger }) => passenger.id),
  ).size

  const focusPassenger = (passengerId) => {
    setSelectedPassengerId(passengerId)
    setReviewedPassengerIds((current) =>
      current.filter((id) => id !== passengerId),
    )
  }

  const selectedPassengerRequests = unresolvedRequests.filter(
    (request) => request.passengerId === focusedPassengerId,
  )
  return (
    <section className="crew-dashboard" id="crew-seat-map">
      <div className="crew-intro">
        <div>
          <span className="eyebrow">CABIN OPERATIONS · LOCAL DEMO</span>
          <h2>Cabin overview</h2>
        </div>
        <p>
          Use the illustrative map or attention list to open a focused
          service review. Review does not approve or change a catering request.
        </p>
      </div>

      <div className="crew-summary crew-operations-summary">
        <div>
          <span>Passengers</span>
          <strong>{passengers.length}</strong>
        </div>
        <div>
          <span>Allergy flags</span>
          <strong className={allergyCount ? 'ops-alert-number' : ''}>{allergyCount}</strong>
        </div>
        <div>
          <span>Unresolved requests</span>
          <strong>{unresolvedRequests.length}</strong>
        </div>
        <div>
          <span>Need attention</span>
          <strong className={passengersNeedingAttention ? 'ops-attention-number' : ''}>
            {passengersNeedingAttention}
          </strong>
        </div>
      </div>

      <div className="crew-meal-breakdown">
        <span>DIETARY MEAL COUNTS</span>
        <div>
          {Object.entries(mealCounts).map(([name, count]) => (
            <span className="crew-meal-count" key={name}>
              <strong>{count}</strong>{name}
            </span>
          ))}
          {!Object.keys(mealCounts).length && <span>No meal selections recorded.</span>}
        </div>
      </div>

      <div className="crew-ops-layout">
        <div className="cabin-panel">
          <div className="cabin-heading">
            <span>FRONT OF AIRCRAFT</span>
            <span>ILLUSTRATIVE MAP · 6 ROWS</span>
          </div>

          <div className="cabin-nose" aria-hidden="true">
            <span />
          </div>

          <div className="seat-map">
            {Array.from({ length: SEAT_ROWS }, (_, rowIndex) => {
              const rowNumber = rowIndex + 1

              return (
                <div className="seat-row" key={rowNumber}>
                  {SEATS_PER_ROW.map((letter, columnIndex) => {
                    const seatId = `${rowNumber}${letter}`
                    const assignment = assignments.find(
                      (item) => item.seat === seatId,
                    )
                    const passenger = assignment?.passenger
                    const status = getSeatStatus(passenger)

                    return (
                      <button
                        key={seatId}
                        type="button"
                        className={[
                          'crew-seat',
                          getSeatClass(status),
                          selectedAssignment?.seat === seatId
                            ? 'crew-seat-selected'
                            : '',
                          columnIndex === 3 ? 'aisle-after' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => {
                          if (passenger) focusPassenger(passenger.id)
                          else setSelectedPassengerId(null)
                        }}
                        aria-pressed={focusedPassengerId === passenger?.id}
                        aria-label={`${seatId}, ${
                          passenger?.name ?? 'No passenger assigned'
                        }, ${status}`}
                      >
                        <span>{seatId}</span>
                        {passenger && (
                          <span className="seat-passenger-dot" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="seat-legend">
            <span><i className="legend-allergy" /> Allergy declared</span>
            <span><i className="legend-sattvik" /> Sattvik</span>
            <span><i className="legend-jain" /> Jain</span>
            <span><i className="legend-standard" /> Standard / other</span>
            <span><i className="legend-empty" /> No assignment</span>
          </div>

          <p className="crew-demo-note">
            All seat placements are illustrative index-to-seat examples, not
            verified assignments. Records beyond the six demo placements have
            no seat position in this prototype.
          </p>
        </div>

        <aside className="crew-priority-panel" aria-labelledby="crew-priority-heading">
          <div className="crew-priority-heading">
            <div>
              <span className="eyebrow">SERVICE PRIORITY</span>
              <h3 id="crew-priority-heading">Needs attention</h3>
            </div>
            <span className="crew-priority-count">{passengerAttention.length}</span>
          </div>
          {passengerAttention.length ? (
            <ol className="crew-priority-list">
              {passengerAttention.map((item) => {
                const assignment = assignments.find(
                  (entry) => entry.passenger?.id === item.passenger.id,
                )
                const reason = item.allergyRequest
                  ? 'Allergy declaration changed · verify'
                  : item.hasUrgentRequest
                    ? 'Urgent catering request'
                    : item.mealRequest
                      ? `Meal request · ${item.mealRequest.status}`
                      : 'Declared allergy · verify'

                return (
                  <li key={item.passenger.id}>
                    <div className={`priority-mark priority-level-${item.priority}`} />
                    <div className="crew-priority-person">
                      <strong>{item.passenger.name || 'Unnamed passenger'}</strong>
                      <span>{reason}</span>
                      <small>
                        {assignment
                          ? `${assignment.seat} · illustrative`
                          : 'Seat unavailable'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="crew-review-meal-button"
                      onClick={() => focusPassenger(item.passenger.id)}
                    >
                      Review meal
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="crew-priority-empty">
              <span aria-hidden="true">✓</span>
              <strong>No attention items</strong>
              <p>Declared allergies and unresolved change requests will appear here for review.</p>
            </div>
          )}

          <div className="crew-review-panel" aria-live="polite">
            <div className="crew-review-panel-head">
              <div>
                <span className="eyebrow">FOCUSED REVIEW</span>
                <h4>{selectedPassenger?.name || (selectedPassengerId === null ? 'No passenger selected' : 'Select a passenger')}</h4>
              </div>
              {selectedAssignment && (
                <span className="crew-demo-seat-tag">{selectedAssignment.seat} · DEMO</span>
              )}
            </div>

          {selectedPassenger ? (
            <>
              <div className="crew-detail-field">
                <span>Current meal preference</span>
                <strong>{selectedMeal?.name ?? 'Not specified'}</strong>
              </div>

              <div className="crew-detail-field">
                <span>Declared allergies</span>
                <strong>
                  {selectedPassenger.allergies?.length
                    ? selectedPassenger.allergies
                        .map((id) =>
                          supportedAllergens.find(
                            (allergen) => allergen.id === id,
                          )?.label ?? id,
                        )
                        .join(', ')
                    : 'No supported allergy selected'}
                </strong>
              </div>

              {selectedPassenger.customAllergy?.trim() && (
                <div className="crew-alert">
                  <strong>Manual verification required</strong>
                  <p>{selectedPassenger.customAllergy.trim()}</p>
                </div>
              )}

              {selectedPassenger.allergies?.length > 0 && (
                <div className="crew-alert">
                  <strong>Allergy information declared</strong>
                  <p>
                    Verify ingredients and cross-contact controls with the
                    airline's approved catering information.
                  </p>
                </div>
              )}

              {selectedPassenger.notes?.trim() && (
                <div className="crew-detail-field">
                  <span>Additional requests</span>
                  <p>{selectedPassenger.notes}</p>
                </div>
              )}
              {selectedPassengerRequests.length > 0 && (
                <div className="crew-pending-request-list">
                  <span>OPEN CHANGE REQUESTS</span>
                  {selectedPassengerRequests.map((request) => (
                    <div key={request.id}>
                      <strong>
                        {request.allergyChange
                          ? 'Allergy declaration changed · verify directly'
                          : `${request.previousMeal || 'Meal'} → ${request.requestedMeal || 'Requested meal'}`}
                      </strong>
                      <span>{request.status} · received {new Date(request.timestamp).toLocaleString()}</span>
                      {request.allergyChange && (
                        <small>Updated declaration: {request.updatedAllergies || 'None recorded'}</small>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {reviewedPassengerIds.includes(selectedPassenger.id) ? (
                <div className="crew-review-complete" role="status">
                  Requirements reviewed in this session. No catering approval,
                  safety clearance, or meal change was made.
                </div>
              ) : (
                <button
                  className="crew-review-confirm-button"
                  type="button"
                  onClick={() =>
                    setReviewedPassengerIds((current) =>
                      current.includes(selectedPassenger.id)
                        ? current
                        : [...current, selectedPassenger.id],
                    )
                  }
                >
                  Mark requirements reviewed
                </button>
              )}
            </>
          ) : (
            <div className="crew-review-empty">
              <strong>No passenger record selected</strong>
              <p>Select an occupied illustrative seat or a passenger requiring attention.</p>
            </div>
          )}
          </div>
        </aside>
      </div>

    </section>
  )
}

export default CrewSeatMap
