import { useEffect, useRef } from 'react'
import '../App.css'

const ROUTES = {
  north: 'M -80 600 C 220 520 330 360 610 400 C 920 445 1000 170 1530 210',
  center: 'M -60 235 C 260 310 390 560 700 520 C 1000 480 1120 310 1510 440',
  south: 'M 70 960 C 280 720 570 760 790 650 C 1060 510 1190 720 1500 625',
}

const WAYPOINTS = [
  [130, 573],
  [610, 400],
  [1060, 330],
  [300, 330],
  [700, 520],
  [1260, 390],
  [285, 777],
  [790, 650],
  [1180, 645],
]

function FlightPathBackground({ mode }) {
  const trailPathRef = useRef(null)
  const cursorPointRef = useRef(null)

  useEffect(() => {
    const trailPath = trailPathRef.current
    const cursorPoint = cursorPointRef.current
    if (!trailPath || !cursorPoint) return undefined

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointerPreference = window.matchMedia('(pointer: fine)')
    const points = []
    const maxPoints = 9
    const lifetime = mode === 'dynamic' ? 720 : 420
    let reducedMotion = motionPreference.matches
    let finePointer = pointerPreference.matches
    let pointer = null
    let frameId = null
    let pointerListenerAttached = false

    const hideTrail = () => {
      trailPath.setAttribute('d', '')
      trailPath.style.opacity = '0'
      cursorPoint.style.opacity = '0'
    }

    const drawTrail = (timestamp) => {
      frameId = null
      if (reducedMotion || !finePointer) {
        points.length = 0
        pointer = null
        hideTrail()
        return
      }

      if (pointer) {
        const lastPoint = points[points.length - 1]
        const distance = lastPoint
          ? Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y)
          : 0

        if (lastPoint && distance > 92) points.length = 0
        const current = points[points.length - 1]
        if (!current || Math.hypot(pointer.x - current.x, pointer.y - current.y) > 2) {
          points.push({ x: pointer.x, y: pointer.y, time: timestamp })
          while (points.length > maxPoints) points.shift()
          let totalDistance = 0
          for (let index = points.length - 1; index > 0; index -= 1) {
            totalDistance += Math.hypot(
              points[index].x - points[index - 1].x,
              points[index].y - points[index - 1].y,
            )
          }
          while (points.length > 2 && totalDistance > 180) {
            totalDistance -= Math.hypot(
              points[1].x - points[0].x,
              points[1].y - points[0].y,
            )
            points.shift()
          }
        }
      }

      while (points.length && timestamp - points[0].time > lifetime) points.shift()
      if (!points.length) {
        hideTrail()
        return
      }

      let pathData = `M ${points[0].x} ${points[0].y}`
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        pathData += ` Q ${previous.x} ${previous.y} ${(previous.x + current.x) / 2} ${(previous.y + current.y) / 2}`
      }
      const lastPoint = points[points.length - 1]
      pathData += ` L ${lastPoint.x} ${lastPoint.y}`
      const age = (timestamp - points[0].time) / lifetime
      trailPath.setAttribute('d', pathData)
      trailPath.style.opacity = String((1 - age) * (mode === 'dynamic' ? 0.52 : 0.28))
      cursorPoint.setAttribute('cx', String(lastPoint.x))
      cursorPoint.setAttribute('cy', String(lastPoint.y))
      cursorPoint.style.opacity = mode === 'dynamic' ? '0.68' : '0.42'
      frameId = window.requestAnimationFrame(drawTrail)
    }

    const scheduleDraw = () => {
      if (frameId === null) frameId = window.requestAnimationFrame(drawTrail)
    }
    const handlePointerMove = (event) => {
      if (event.pointerType !== 'mouse' || reducedMotion || !finePointer) return
      pointer = {
        x: event.clientX * (1440 / window.innerWidth),
        y: event.clientY * (900 / window.innerHeight),
      }
      scheduleDraw()
    }
    const handlePointerLeave = () => {
      pointer = null
      scheduleDraw()
    }
    const syncPointerListener = () => {
      const shouldListen = finePointer && !reducedMotion
      if (shouldListen && !pointerListenerAttached) {
        window.addEventListener('pointermove', handlePointerMove, { passive: true })
        window.addEventListener('pointerleave', handlePointerLeave)
        pointerListenerAttached = true
      } else if (!shouldListen && pointerListenerAttached) {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerleave', handlePointerLeave)
        pointerListenerAttached = false
        points.length = 0
        pointer = null
        hideTrail()
      }
    }
    const handleMotionPreferenceChange = (event) => {
      reducedMotion = event.matches
      syncPointerListener()
    }
    const handlePointerPreferenceChange = (event) => {
      finePointer = event.matches
      syncPointerListener()
    }

    hideTrail()
    syncPointerListener()
    motionPreference.addEventListener('change', handleMotionPreferenceChange)
    pointerPreference.addEventListener('change', handlePointerPreferenceChange)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      hideTrail()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
      motionPreference.removeEventListener('change', handleMotionPreferenceChange)
      pointerPreference.removeEventListener('change', handlePointerPreferenceChange)
    }
  }, [mode])

  return (
    <div className="flight-path-background" data-mode={mode} aria-hidden="true">
      <svg
        className="flight-route-map"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        focusable="false"
      >
        <g className="flight-route-lines" fill="none">
          <path id="flight-route-north" d={ROUTES.north} />
          <path id="flight-route-center" d={ROUTES.center} />
          <path id="flight-route-south" d={ROUTES.south} />
        </g>
        <g className="flight-route-waypoints">
          {WAYPOINTS.map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.3" />
          ))}
        </g>
        {mode === 'dynamic' && (
          <g className="flight-aircraft-markers">
            <g>
              <animateMotion
                dur="78s"
                repeatCount="indefinite"
                rotate="auto"
                path={ROUTES.north}
              />
              <path d="M -6 0 L -1 -1.2 L 1 -4.5 L 2 -4.5 L 2 -0.5 L 6 1 L 6 2 L 2 1 L 2 4.5 L 1 4.5 L -1 1.2 L -6 0.5 Z" />
            </g>
            <g>
              <animateMotion
                dur="96s"
                begin="-43s"
                repeatCount="indefinite"
                rotate="auto"
                path={ROUTES.south}
              />
              <path d="M -6 0 L -1 -1.2 L 1 -4.5 L 2 -4.5 L 2 -0.5 L 6 1 L 6 2 L 2 1 L 2 4.5 L 1 4.5 L -1 1.2 L -6 0.5 Z" />
            </g>
          </g>
        )}
        <path ref={trailPathRef} className="flight-cursor-trail" d="" />
        <circle
          ref={cursorPointRef}
          className="flight-cursor-waypoint"
          cx="-20"
          cy="-20"
          r="2.8"
        />
      </svg>
    </div>
  )
}

export default FlightPathBackground
