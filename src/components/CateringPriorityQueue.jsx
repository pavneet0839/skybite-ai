import { useEffect, useState } from 'react'
import '../App.css'

const NEXT_STATUSES = {
  New: ['Acknowledged', 'Unable to fulfil'],
  Acknowledged: ['Preparing', 'Unable to fulfil'],
  Preparing: ['Ready', 'Unable to fulfil'],
}

const RESOLVED_STATUSES = new Set([
  'Ready',
  'Unable to fulfil',
  'Approved',
  'Rejected by staff',
  'Expired — cutoff',
  'Rejected — selection changed',
])
const REJECTED_STATUSES = new Set([
  'Rejected — cutoff',
  'Rejected — departure unconfigured',
  'Rejected by staff',
  'Expired — cutoff',
  'Rejected — selection changed',
])
const PENDING_EXPRESS_SWAP_STATUS = 'Pending staff review'
const URGENT_WINDOW_MS = 60 * 60 * 1000

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return date.toLocaleString()
}

function formatTimeRemaining(value) {
  if (!Number.isFinite(value)) return 'Undetermined'
  const minutes = Math.floor(Math.abs(value) / 60_000)
  if (value < 0) {
    return minutes
      ? `Departure passed ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
      : 'Departure passed less than 1 minute ago'
  }
  return minutes
    ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
    : 'Less than 1 minute'
}

function getDepartureTime(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function getPriority(request, departureTime, now) {
  const isResolved = RESOLVED_STATUSES.has(request.status)
  const isRejected = request.outcome === 'rejected'
  const receivedAt = new Date(request.timestamp).getTime()
  const validReceivedAt = !Number.isNaN(receivedAt)
  const urgentAtReceipt = request.requestType === 'express-meal-swap'
    ? request.urgentAtReceipt
    : validReceivedAt &&
      departureTime !== null &&
      receivedAt <= departureTime &&
      departureTime - receivedAt <= URGENT_WINDOW_MS
  const enteringDepartureWindow =
    !isResolved &&
    !isRejected &&
    departureTime !== null &&
    now <= departureTime &&
    departureTime - now <= URGENT_WINDOW_MS

  return {
    allergyAlert: request.allergyChange,
    urgent: !isRejected && (urgentAtReceipt || enteringDepartureWindow),
    dynamicUrgency: enteringDepartureWindow && !urgentAtReceipt,
    timeUnknown: departureTime === null,
  }
}

function priorityWeight(priority) {
  if (priority.allergyAlert && priority.urgent) return 3
  if (priority.allergyAlert) return 2
  if (priority.urgent) return 1
  return 0
}

function sortRequests(requests, departureTime, now) {
  return [...requests].sort((left, right) => {
    const weightDifference =
      priorityWeight(getPriority(right, departureTime, now)) -
      priorityWeight(getPriority(left, departureTime, now))
    if (weightDifference) return weightDifference
    return new Date(right.timestamp).getTime() -
      new Date(left.timestamp).getTime()
  })
}

function PriorityBadges({ request, departureTime, now }) {
  const priority = getPriority(request, departureTime, now)

  return (
    <div className="catering-priority-badges" aria-label="Request priority">
      {request.outcome === 'rejected' && (
        <span className="priority-badge priority-rejected">
          {request.requestType === 'express-meal-swap' &&
          !['Rejected — cutoff', 'Rejected — departure unconfigured'].includes(request.status)
            ? 'REQUEST CLOSED · NOT APPROVED'
            : 'REJECTED · NOT SUBMITTED'}
        </span>
      )}
      {priority.allergyAlert && (
        <span className="priority-badge priority-allergy">ALLERGY ALERT · VERIFY</span>
      )}
      {priority.urgent && (
        <span className="priority-badge priority-urgent">URGENT · DEPARTURE WINDOW</span>
      )}
      {priority.timeUnknown && (
        <span className="priority-badge priority-unknown">
          TIME-BASED PRIORITY UNDETERMINED
        </span>
      )}
      {request.outcome !== 'rejected' &&
        !priority.allergyAlert &&
        !priority.urgent &&
        !priority.timeUnknown && (
        <span className="priority-badge priority-standard">STANDARD</span>
        )}
    </div>
  )
}

function RequestCard({
  request,
  departureTime,
  now,
  onStatusChange,
  onExpressDecision,
  resolved = false,
  privacyMode = false,
}) {
  const minimizePassengerDetails =
    privacyMode && (resolved || request.outcome === 'rejected')
  const pendingExpressSwap =
    request.requestType === 'express-meal-swap' &&
    request.outcome === 'submitted' &&
    request.status === PENDING_EXPRESS_SWAP_STATUS

  return (
    <article className={`catering-request${request.allergyChange ? ' request-has-allergy' : ''}`}>
      <div className="catering-request-header">
        <div>
          <PriorityBadges request={request} departureTime={departureTime} now={now} />
          <h4>
            {minimizePassengerDetails
              ? 'Historical request · details minimized'
              : request.passengerName || 'Unnamed passenger'}
          </h4>
          <p className="catering-request-reference">
            Flight reference: {request.flightReference || 'Not provided'}
          </p>
        </div>
        <div className={`catering-request-status${request.outcome === 'rejected' ? ' status-rejected' : ''}`}>
          <span>Status</span>
          {pendingExpressSwap ? (
            <strong className="express-pending-status">{request.status}</strong>
          ) : request.outcome === 'rejected' ||
          RESOLVED_STATUSES.has(request.status) ? (
            <strong>{request.status}</strong>
          ) : (
            <select
              id={`request-status-${request.id}`}
              value={request.status}
              onChange={(event) => onStatusChange(request.id, event.target.value)}
              aria-label={`Status for ${request.passengerName || 'passenger'} request`}
            >
              <option key={request.status} value={request.status}>{request.status}</option>
              {(NEXT_STATUSES[request.status] ?? []).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          )}
          {request.outcome === 'submitted' && (
            <small>
              {request.status === 'New'
                ? 'Received · awaiting catering confirmation'
                : request.status === 'Acknowledged'
                  ? 'Acknowledged · fulfilment is not confirmed'
                  : request.status === 'Preparing'
                    ? 'Preparing · delivery is not confirmed'
                    : ''}
            </small>
          )}
        </div>
      </div>

      {!minimizePassengerDetails && request.previousMeal !== undefined && (
        <div className="catering-request-detail">
          <strong>{pendingExpressSwap ? 'Lounge-to-Gate Express Swap' : 'Meal change'}</strong>
          <span>{request.previousMeal || 'Not set'} → {request.requestedMeal || 'Not set'}</span>
        </div>
      )}
      {pendingExpressSwap && (
        <div className="express-swap-review">
          <strong>Staff decision · local demo role only</strong>
          <p>Review the passenger’s requested change. Approval updates the current demo meal selection; it does not confirm preparation or gate delivery.</p>
          <div>
            <button
              type="button"
              className="express-swap-approve"
              onClick={() => onExpressDecision(request.id, 'approve')}
            >
              Approve request
            </button>
            <button
              type="button"
              className="express-swap-reject"
              onClick={() => onExpressDecision(request.id, 'reject')}
            >
              Reject request
            </button>
          </div>
        </div>
      )}

      {!minimizePassengerDetails && request.allergyChange && (
        <div className="catering-allergy-detail" role="note">
          <strong>Allergy declaration changed — verify directly with approved catering information.</strong>
          <div>
            <span>Previous: {request.previousAllergies || 'None recorded'}</span>
            <span>Updated: {request.updatedAllergies || 'None recorded'}</span>
          </div>
        </div>
      )}
      {request.outcome === 'rejected' && (
        <div className="catering-rejection-detail" role="note">
          <strong>
            {request.status === 'Rejected by staff'
              ? 'Staff decision · rejected'
              : request.status === 'Expired — cutoff'
                ? 'Not approved · cutoff expired'
                : request.status === 'Rejected — selection changed'
                  ? 'Not approved · selection changed'
                  : 'Not submitted as an accepted catering request'}
          </strong>
          <p>{request.outcomeMessage || request.rejectionReason}</p>
        </div>
      )}
      {request.requestType === 'express-meal-swap' && request.outcome === 'submitted' &&
        request.status === 'Approved' && (
          <div className="express-swap-approved" role="note">
            <strong>Approved in the local demo only</strong>
            <p>{request.outcomeMessage}</p>
          </div>
        )}

      <div className="catering-request-meta">
        {request.seat && (
          <span>Seat: {request.seat}</span>
        )}
        <span>Received: {formatDateTime(request.timestamp)}</span>
        {request.requestType === 'express-meal-swap' && (
          <>
            <span>Scheduled departure: {request.scheduledDepartureTime
              ? formatDateTime(request.scheduledDepartureTime)
              : 'Not configured'}</span>
            <span>Time remaining at submission: {formatTimeRemaining(request.timeRemainingAtSubmissionMs)}</span>
            {Number.isFinite(request.decisionTimeRemainingMs) && request.decidedAt && (
              <span>Time remaining at staff decision: {formatTimeRemaining(request.decisionTimeRemainingMs)}</span>
            )}
          </>
        )}
        {request.priorityReason && (
          <span>Priority reason: {request.priorityReason}</span>
        )}
        {getPriority(request, departureTime, now).dynamicUrgency && (
          <span>
            Current urgency: unresolved request is within 60 minutes of configured departure.
          </span>
        )}
        {request.statusHistory?.length > 1 && (
          <span className="catering-status-history">
            Status history: {request.statusHistory
              .map((entry) => `${entry.status} (${formatDateTime(entry.timestamp)})`)
              .join(' → ')}
          </span>
        )}
        {!minimizePassengerDetails && request.passengerNotes && (
          <span>Passenger notes at request: {request.passengerNotes}</span>
        )}
        <span className="catering-request-id">Request ID: {request.id}</span>
      </div>
      {resolved && <span className="resolved-request-label">History · retained</span>}
    </article>
  )
}

function CateringPriorityQueue({
  requests,
  departureTime,
  onDepartureTimeChange,
  minimumLeadMinutes,
  onMinimumLeadMinutesChange,
  onStatusChange,
  onExpressDecision,
  privacyMode = false,
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timerId)
  }, [])

  const departureTimestamp = getDepartureTime(departureTime)
  const ordered = sortRequests(requests, departureTimestamp, now)
  const activeRequests = ordered.filter(
    (request) =>
      request.outcome !== 'rejected' &&
      !RESOLVED_STATUSES.has(request.status),
  )
  const resolvedRequests = ordered.filter((request) =>
    RESOLVED_STATUSES.has(request.status) &&
    !REJECTED_STATUSES.has(request.status),
  )

  return (
    <section className="catering-queue-section" id="catering-priority-queue">
      <div className="catering-queue-intro">
        <span className="section-kicker">LOCAL PROTOTYPE · NO CATERER NOTIFICATIONS</span>
        <h2>Last-minute catering priority queue.</h2>
        <p>
          Meal and allergy changes are recorded here for demonstration.
          Allergy flags require verification; they do not confirm that a meal
          is safe or that catering has fulfilled a request. A received request
          is not catering acceptance.
        </p>
      </div>

      <div className="departure-setting">
        <div className="departure-setting-field">
          <label htmlFor="catering-departure-time">Configured departure date and time</label>
          <input
            id="catering-departure-time"
            className="meal-input"
            type="datetime-local"
            step="0.001"
            value={departureTime}
            onChange={(event) => onDepartureTimeChange(event.target.value)}
          />
        </div>
        <div className="departure-setting-field">
          <label htmlFor="meal-request-lead-time">Minimum lead time for new meal requests (minutes)</label>
          <input
            id="meal-request-lead-time"
            className="meal-input"
            type="number"
            min="0"
            step="1"
            value={minimumLeadMinutes}
            onChange={(event) =>
              onMinimumLeadMinutesChange(
                event.target.value === ''
                  ? 0
                  : Math.max(0, Number(event.target.value)),
              )
            }
          />
        </div>
        <p>
          {departureTimestamp === null
            ? 'Departure time is not configured or is invalid. Time-based priority cannot yet be determined.'
            : `Configured local departure time: ${formatDateTime(departureTime)}.`}
        </p>
      </div>

      <div className="catering-queue-columns">
        <section className="catering-queue-list" aria-labelledby="open-requests-heading">
          <div className="catering-queue-heading">
            <h3 id="open-requests-heading">Unresolved requests</h3>
            <span>{activeRequests.length}</span>
          </div>
          {activeRequests.length ? (
            activeRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                departureTime={departureTimestamp}
                now={now}
                onStatusChange={onStatusChange}
                onExpressDecision={onExpressDecision}
                privacyMode={privacyMode}
              />
            ))
          ) : (
            <p className="catering-queue-empty">
              No unresolved requests. Changes to passenger meals or allergies
              will appear here.
            </p>
          )}
        </section>

        <section className="catering-queue-list catering-history" aria-labelledby="resolved-requests-heading">
          <div className="catering-queue-heading">
            <h3 id="resolved-requests-heading">Resolved / history</h3>
            <span>{resolvedRequests.length}</span>
          </div>
          {resolvedRequests.length ? (
            resolvedRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                departureTime={departureTimestamp}
                now={now}
                onStatusChange={onStatusChange}
                onExpressDecision={onExpressDecision}
                resolved
                privacyMode={privacyMode}
              />
            ))
          ) : (
            <p className="catering-queue-empty">
              Approved, Ready, and Unable to fulfil requests remain available here.
            </p>
          )}
        </section>
      </div>
      <section className="catering-queue-list catering-rejected-history" aria-labelledby="rejected-requests-heading">
        <div className="catering-queue-heading">
          <h3 id="rejected-requests-heading">Rejected meal requests · history</h3>
          <span>{ordered.filter((request) => REJECTED_STATUSES.has(request.status)).length}</span>
        </div>
        {ordered.filter((request) => REJECTED_STATUSES.has(request.status)).map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            departureTime={departureTimestamp}
            now={now}
            onStatusChange={onStatusChange}
            resolved
            privacyMode={privacyMode}
          />
        ))}
        {!ordered.some((request) => REJECTED_STATUSES.has(request.status)) && (
          <p className="catering-queue-empty">Rejected requests remain visible here and are not treated as accepted orders.</p>
        )}
      </section>
    </section>
  )
}

export default CateringPriorityQueue
