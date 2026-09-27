import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { createSpaceScene } from './scene.js';
import {
  profile,
  education,
  experience,
  projects,
  skills,
  achievements,
  certifications,
  stations,
  credits,
  dossier,
} from './content.js';
import './styles.css';

const MIN_LOADER_MS = 1600;

if (import.meta.env.DEV) {
  window.__errs = [];
  window.addEventListener('error', (event) => window.__errs.push(event.error?.stack || event.message));
  window.addEventListener('unhandledrejection', (event) => window.__errs.push(String(event.reason?.stack || event.reason)));
}

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// Short prompts shown one at a time. `seconds` marks a prompt that clears on a timer; the others
// clear when the visitor performs the action.
const COACH = {
  fly: { id: 'fly', step: '1 / 5', desktop: 'Hold W to fly. Move the cursor to steer.', touch: 'Hold Thrust to fly. Steer with the stick.' },
  find: { id: 'find', step: '2 / 5', seconds: 8, desktop: 'Follow the radar to a station. Or skip flying: click a section in Quick travel.', touch: 'Follow the radar to a station. Or skip flying: tap a section in the list.' },
  dock: { id: 'dock', step: '3 / 5', desktop: 'In range. Press Space to dock.', touch: 'In range. Tap Dock.' },
  read: { id: 'read', step: '4 / 5', seconds: 7, desktop: 'Scroll the report. Leave orbit when you are done.', touch: 'Scroll the report. Tap Leave orbit when you are done.' },
  more: { id: 'more', step: '5 / 5', seconds: 7, desktop: 'Four more stations to explore. Help is in the top bar.', touch: 'Four more stations to explore. Help is in the top bar.' },
};

const HELP_LINES = {
  desktop: [
    ['fly', 'hold W'],
    ['steer', 'move the cursor, or arrow keys'],
    ['boost', 'hold Shift'],
    ['brake', 'hold S'],
    ['climb / descend', 'R / F'],
    ['dock', 'Space when a station is in range'],
    ['leave a station', 'any key, or Leave orbit'],
  ],
  touch: [
    ['fly', 'hold Thrust'],
    ['steer', 'left stick (up and down changes altitude)'],
    ['boost', 'hold Boost'],
    ['dock', 'tap Dock when a station is in range'],
    ['leave a station', 'tap Leave orbit'],
  ],
};

function HelpTerminal({ onClose, onTravel, canTravel }) {
  const lines = isTouch ? HELP_LINES.touch : HELP_LINES.desktop;
  return (
    <section className="help" role="dialog" aria-modal="true" aria-label="Help" data-ui onClick={onClose}>
      <div className="help-window mono" onClick={(event) => event.stopPropagation()}>
        <header className="help-bar">
          <span>pioneer-01 — help</span>
          <button type="button" onClick={onClose} aria-label="Close help">close ✕</button>
        </header>
        <div className="help-body">
          <p><b>pioneer-01:~$</b> help</p>
          <p className="help-dim"># This portfolio is a small star system. Each station holds one section.</p>
          <div className="help-skip">
            <p className="help-head">NO TIME TO FLY? JUMP STRAIGHT TO A SECTION</p>
            <p>You do not have to pilot the ship. {canTravel ? 'Pick a section and the autopilot takes you there and opens it.' : 'Press Go on the first screen, then pick a section here or in the Quick travel list.'}</p>
            <div className="help-jump">
              {stations.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  disabled={!canTravel}
                  style={{ '--accent': station.color }}
                  onClick={() => onTravel(station.id)}
                >
                  <span>{station.index}</span>
                  {station.label}
                </button>
              ))}
            </div>
          </div>
          <p className="help-head">FLY</p>
          <dl>
            {lines.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
          <p className="help-head">FIND YOUR WAY</p>
          <dl>
            <dt>radar</dt>
            <dd>your nose points up; dots are stations; ▲ ▼ means above or below you</dd>
            <dt>quick travel</dt>
            <dd>the list on the right does the same as the buttons above, any time</dd>
            <dt>event horizon</dt>
            <dd>fly into the black hole, far below, to return to Earth orbit</dd>
          </dl>
          <p className="help-head">STATIONS</p>
          <dl>
            {stations.map((station) => (
              <React.Fragment key={station.id}>
                <dt style={{ color: station.color }}>{station.index} {station.label}</dt>
                <dd>{station.title}</dd>
              </React.Fragment>
            ))}
          </dl>
          <p className="help-head">SHORT ON TIME</p>
          <dl>
            <dt>résumé</dt>
            <dd><a href={profile.links.resume} target="_blank" rel="noreferrer">open the PDF</a>, also in the top bar</dd>
            <dt>pilot dossier</dt>
            <dd>the same résumé as an in-site page, in the top bar</dd>
          </dl>
          <p><b>pioneer-01:~$</b> <i className="help-caret" /></p>
        </div>
      </div>
    </section>
  );
}

// Left-thumb stick for phones: reports a unit vector (x right, y up) while held.
function Joystick({ onChange }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const pointerId = useRef(null);
  const set = (x, y, active) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${(x * 36).toFixed(1)}px, ${(-y * 36).toFixed(1)}px)`;
    if (baseRef.current) baseRef.current.classList.toggle('active', active);
    onChange(x, y, active);
  };
  const read = (event) => {
    const rect = baseRef.current.getBoundingClientRect();
    const radius = rect.width / 2;
    let x = (event.clientX - (rect.left + radius)) / radius;
    let y = -(event.clientY - (rect.top + radius)) / radius;
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    set(x, y, true);
  };
  return (
    <div
      ref={baseRef}
      className="joystick"
      role="application"
      aria-label="Steering stick"
      onPointerDown={(event) => {
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        read(event);
      }}
      onPointerMove={(event) => { if (pointerId.current === event.pointerId) read(event); }}
      onPointerUp={() => { pointerId.current = null; set(0, 0, false); }}
      onPointerCancel={() => { pointerId.current = null; set(0, 0, false); }}
    >
      <i ref={knobRef} className="joystick-knob" />
    </div>
  );
}

function HoldButton({ className, label, onHold, children }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onHold(true); }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

function App() {
  const canvasRef = useRef(null);
  const sceneApi = useRef(null);
  const panelRefs = useRef({});
  const labelRefs = useRef({});
  const markerRef = useRef(null);
  const hudRef = useRef(null);
  const radarRef = useRef(null);
  const goRef = useRef(null);
  const [phase, setPhase] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [flight, setFlight] = useState({ mode: 'flight', station: null, dockable: null, interacted: false });
  const [dossierOpen, setDossierOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Coach prompts: timed ones are ticked off here; action ones clear when the flight reports the action.
  const [coachSeen, setCoachSeen] = useState(() => {
    try { return window.localStorage.getItem('pioneer-coach') === 'done' ? { all: true } : {}; } catch { return {}; }
  });
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    const startedAt = performance.now();
    const api = createSpaceScene(canvasRef.current, {
      onProgress: (ratio) => setProgress((value) => Math.max(value, Math.round(ratio * 100))),
      onReady: () => {
        setProgress(100);
        const wait = Math.max(0, MIN_LOADER_MS - (performance.now() - startedAt));
        window.setTimeout(() => setPhase('orbit'), wait + 400);
      },
      onFlightState: (next) => setFlight(next),
      onReturnToOrbit: () => {
        setFlight({ mode: 'flight', station: null, dockable: null, interacted: true });
        setPhase('orbit');
        setReturning(true);
        window.setTimeout(() => setReturning(false), 1500);
      },
      dom: {
        panel: (id) => panelRefs.current[id] || null,
        label: (id) => labelRefs.current[id] || null,
        marker: () => markerRef.current,
        hud: () => hudRef.current,
        radar: () => radarRef.current,
      },
    });
    sceneApi.current = api;
    return () => api.dispose();
  }, []);

  useEffect(() => {
    sceneApi.current?.setPhase(phase);
  }, [phase]);

  // The dossier takes over input while it is open.
  useEffect(() => {
    sceneApi.current?.setInputLocked(dossierOpen || helpOpen);
    if (!dossierOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setDossierOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dossierOpen, helpOpen]);

  useEffect(() => {
    if (!helpOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setHelpOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  // Which prompt, if any, the visitor needs right now.
  const coach = useMemo(() => {
    if (phase !== 'universe' || coachSeen.all || helpOpen || dossierOpen) return null;
    if (flight.mode === 'orbit') return coachSeen.read ? null : COACH.read;
    if (flight.mode !== 'flight') return null;
    if (!flight.moved) return COACH.fly;
    if (!flight.docked) {
      if (flight.dockable) return COACH.dock;
      return coachSeen.find ? null : COACH.find;
    }
    if (flight.left && !coachSeen.more) return COACH.more;
    return null;
  }, [phase, coachSeen, helpOpen, dossierOpen, flight.mode, flight.moved, flight.docked, flight.dockable, flight.left]);

  useEffect(() => {
    if (!coach?.seconds) return undefined;
    const timer = window.setTimeout(() => {
      setCoachSeen((seen) => {
        const next = { ...seen, [coach.id]: true };
        if (coach.id === 'more') {
          next.all = true;
          try { window.localStorage.setItem('pioneer-coach', 'done'); } catch { /* storage blocked */ }
        }
        return next;
      });
    }, coach.seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [coach]);

  // Magnetic GO button: it leans toward a nearby cursor.
  useEffect(() => {
    if (phase !== 'orbit') return undefined;
    const onMove = (event) => {
      const el = goRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const reach = 170;
      if (dist < reach) {
        const pull = (1 - dist / reach) * 0.35;
        el.style.transform = `translate(${(dx * pull).toFixed(1)}px, ${(dy * pull).toFixed(1)}px)`;
      } else {
        el.style.transform = '';
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [phase]);

  const completeWarp = useCallback(() => {
    setPhase('universe');
    sceneApi.current?.enterUniverse();
  }, []);

  const initiateJump = () => {
    if (phase !== 'orbit') return;
    setDossierOpen(false);
    setPhase('launch');
    sceneApi.current?.launch();
    window.setTimeout(() => {
      setPhase('warp');
      sceneApi.current?.warp(completeWarp);
    }, 1500);
  };

  const activeStation = useMemo(() => stations.find((s) => s.id === flight.station) || null, [flight.station]);
  const registerPanel = useCallback((id) => (el) => { panelRefs.current[id] = el; }, []);
  const registerLabel = useCallback((id) => (el) => { labelRefs.current[id] = el; }, []);
  const headlineWords = useMemo(() => profile.headline.split(' '), []);

  return (
    <main className={`app phase-${phase} ${isTouch ? 'touch' : ''} ${flight.mode === 'orbit' ? 'in-orbit' : ''} ${flight.mode === 'orbit' || flight.mode === 'docking' ? 'focus' : ''} ${dossierOpen ? 'dossier-open' : ''} ${returning ? 'returning' : ''}`}>
      <canvas ref={canvasRef} className="space-canvas" aria-hidden="true" />

      {phase === 'loading' && (
        <section className="loader" aria-label="Loading">
          <div className="loader-top">
            <span className="wordmark">{profile.name}</span>
            <span className="mono dim">{profile.role}</span>
          </div>
          <div className="loader-count">
            <span className="loader-number">{String(progress).padStart(3, '0')}</span>
            <span className="mono dim">Preparing orbit</span>
          </div>
          <div className="loader-line"><i style={{ transform: `scaleX(${progress / 100})` }} /></div>
        </section>
      )}

      {phase !== 'loading' && (
        <header className="topbar" data-ui>
          <a className="wordmark" href="#top" onClick={(e) => e.preventDefault()}>{profile.name}</a>
          <nav className="topnav">
            <a href={profile.links.github} target="_blank" rel="noreferrer">GitHub</a>
            <a href={profile.links.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
            <a className="keep" href={profile.links.resume} target="_blank" rel="noreferrer">Résumé</a>
            <button type="button" className={`topnav-btn ${helpOpen ? 'active' : ''}`} onClick={() => setHelpOpen((open) => !open)}>
              Help
            </button>
            <button type="button" className={`topnav-btn ${dossierOpen ? 'active' : ''}`} onClick={() => setDossierOpen((open) => !open)}>
              Pilot dossier
            </button>
          </nav>
        </header>
      )}

      {(phase === 'orbit' || phase === 'launch') && (
        <section className="hero" data-ui>
          <div className="hero-copy">
            <p className="mono accent">{profile.tagline}</p>
            <h1 aria-label={profile.headline}>
              {headlineWords.map((word, index) => (
                <span key={`${word}-${index}`} className="w" style={{ '--i': index }} aria-hidden="true">{word}&nbsp;</span>
              ))}
            </h1>
            <p className="lede">{profile.intro}</p>
          </div>
          <button ref={goRef} className="go" onClick={initiateJump} aria-label="Board the vessel and jump">
            <span className="go-ring" />
            <span className="go-label">Go</span>
            <span className="go-sub mono">Board the vessel</span>
          </button>
          <div className="hero-foot mono dim">
            <span>Low Earth orbit</span>
            <span>{profile.location}</span>
            <span>{education.period}</span>
          </div>
        </section>
      )}

      {phase === 'warp' && (
        <section className="warp-ui" aria-label="Jump in progress">
          <p className="mono accent">Jump sequence</p>
          <h2>Crossing to the archive</h2>
          <div className="warp-line"><i /></div>
        </section>
      )}

      {phase === 'universe' && (
        <section className="route" data-ui>
          <div className="route-head">
            <p className="mono accent">Mission route</p>
            <h2 key={activeStation?.id || 'flight'} className="route-title">
              {activeStation ? activeStation.title : 'Fly to a station'}
            </h2>
          </div>

          {coach && (
            <p key={coach.id} className="coach mono" role="status">
              <span>{coach.step}</span>
              {isTouch ? coach.touch : coach.desktop}
            </p>
          )}

          <div ref={radarRef} className="radar" aria-hidden="true">
            <i className="radar-ring" />
            <i className="radar-nose" />
            {stations.map((station) => (
              <b key={`radar-${station.id}`} data-id={station.id} style={{ '--accent': station.color }} />
            ))}
            <b data-id="blackhole" className="radar-hole" />
          </div>

          {stations.map((station) => {
            const dockable = flight.dockable === station.id && flight.mode === 'flight';
            return (
              <button
                key={`label-${station.id}`}
                type="button"
                ref={registerLabel(station.id)}
                className={`station-label ${dockable ? 'dockable' : ''}`}
                style={{ '--accent': station.color }}
                onClick={() => sceneApi.current?.dock(station.id)}
                tabIndex={dockable ? 0 : -1}
                aria-label={`Dock at ${station.label}`}
              >
                <span className="mono">{station.index}</span>
                <strong>{station.label}</strong>
                <span className="mono dist" data-dist />
                {!isTouch && <em className="mono">Space to dock</em>}
              </button>
            );
          })}

          {stations.map((station) => (
            <article
              key={station.id}
              ref={registerPanel(station.id)}
              className="holo"
              data-open="false"
              style={{ '--accent': station.color }}
              aria-hidden={flight.station !== station.id}
            >
              <div className="holo-frame">
                <header className="holo-head">
                  <span className="mono accent">{station.index} · {station.label}</span>
                  <button className="holo-close mono" onClick={() => sceneApi.current?.leaveOrbit()}>Leave orbit</button>
                </header>
                <h3>{station.title}</h3>
                <p className="holo-blurb">{station.blurb}</p>
                <div className="holo-body">
                  <ReportBody id={station.id} onOpenDossier={() => setDossierOpen(true)} />
                </div>
              </div>
            </article>
          ))}

          <button
            type="button"
            ref={registerLabel('blackhole')}
            className="station-label hole-label"
            style={{ '--accent': '#ffb060' }}
            onClick={() => sceneApi.current?.returnToHero()}
            aria-label="Return to Earth orbit"
          >
            <span className="mono">00</span>
            <strong>Event horizon</strong>
            <span className="mono dist" data-dist />
            <em className="mono">Fly in to return to orbit</em>
          </button>

          <aside className="quick-nav" aria-label="Quick travel">
            <p className="mono dim">Quick travel</p>
            {stations.map((station) => (
              <button
                key={`quick-${station.id}`}
                type="button"
                className={`quick-item ${flight.station === station.id ? 'active' : ''}`}
                style={{ '--accent': station.color }}
                onClick={() => sceneApi.current?.jumpTo(station.id)}
              >
                <span className="mono">{station.index}</span>
                <strong>{station.label}</strong>
              </button>
            ))}
            <button type="button" className="quick-item return" onClick={() => sceneApi.current?.returnToHero()}>
              <span className="mono">00</span>
              <strong>Return to orbit</strong>
            </button>
          </aside>

          {isTouch && (
            <div className="touch-controls" data-ui>
              {flight.dockable && flight.mode === 'flight' && (
                <button
                  type="button"
                  className="dock-btn"
                  style={{ '--accent': stations.find((s) => s.id === flight.dockable)?.color }}
                  onClick={() => sceneApi.current?.dock(flight.dockable)}
                >
                  <span className="mono">In range</span>
                  <strong>Dock at {stations.find((s) => s.id === flight.dockable)?.label}</strong>
                </button>
              )}
              <Joystick onChange={(x, y, active) => sceneApi.current?.setStick(x, y, active)} />
              <div className="touch-cluster">
                <HoldButton className="tbtn mono" label="Boost" onHold={(held) => sceneApi.current?.setBoostHeld(held)}>Boost</HoldButton>
                <HoldButton className="thrust-btn mono" label="Thrust" onHold={(held) => sceneApi.current?.setThrustHeld(held)}>Thrust</HoldButton>
              </div>
            </div>
          )}

          <div ref={hudRef} className="flight-hud mono" aria-hidden="true">
            <span>Throttle</span>
            <i className="thr"><b /></i>
            <span data-speed>0 km/s</span>
          </div>

          <nav className="rail" aria-label="Route progress">
            <div className="rail-track">
              <i ref={markerRef} className="rail-marker" />
              {stations.map((station, index) => (
                <button
                  key={station.id}
                  className={`rail-dot ${flight.station === station.id ? 'active' : ''}`}
                  style={{ left: `${(index / (stations.length - 1)) * 100}%`, '--accent': station.color }}
                  onClick={() => sceneApi.current?.jumpTo(station.id)}
                  aria-label={`Fly to ${station.label}`}
                >
                  <span>{station.label}</span>
                </button>
              ))}
            </div>
          </nav>
        </section>
      )}

      {dossierOpen && <Dossier onClose={() => setDossierOpen(false)} />}
      {helpOpen && (
        <HelpTerminal
          onClose={() => setHelpOpen(false)}
          canTravel={phase === 'universe'}
          onTravel={(id) => {
            setHelpOpen(false);
            sceneApi.current?.setInputLocked(false);
            sceneApi.current?.jumpTo(id);
          }}
        />
      )}
    </main>
  );
}

function ReportBody({ id, onOpenDossier }) {
  switch (id) {
    case 'experience':
      return experience.map((item) => (
        <article key={item.role + item.period} className="entry">
          <header><strong>{item.role}</strong><span>{item.period}</span></header>
          <em>{item.org}</em>
          <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </article>
      ));
    case 'projects':
      return projects.map((item) => (
        <article key={item.name} className="entry">
          <header><strong>{item.name}</strong><span>{item.period}</span></header>
          <em>{item.stack}</em>
          <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </article>
      ));
    case 'skills':
      return (
        <>
          {skills.map((group) => (
            <article key={group.group} className="entry">
              <header><strong>{group.group}</strong></header>
              <div className="chips">{group.items.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
          ))}
          <article className="entry">
            <header><strong>Achievements</strong></header>
            <ul>{achievements.map((line) => <li key={line}>{line}</li>)}</ul>
          </article>
          <article className="entry">
            <header><strong>Certifications</strong></header>
            <ul>{certifications.map((line) => <li key={line}>{line}</li>)}</ul>
          </article>
        </>
      );
    case 'contact':
      return (
        <>
          <article className="entry">
            <header><strong>Reach me</strong></header>
            <ul className="contact-list">
              <li><a href={`mailto:${profile.email}`}>{profile.email}</a></li>
              <li><a href={profile.links.linkedin} target="_blank" rel="noreferrer">linkedin.com/in/chaitanya-medidar</a></li>
              <li><a href={profile.links.github} target="_blank" rel="noreferrer">github.com/chaitanyamedidar</a></li>
              <li><a href={profile.links.resume} target="_blank" rel="noreferrer">Résumé · PDF</a></li>
              <li><button type="button" className="linklike" onClick={onOpenDossier}>Open pilot dossier</button></li>
            </ul>
          </article>
          <article className="entry credits">
            <header><strong>3D assets</strong><span>CC BY 4.0</span></header>
            <ul>
              {credits.map((c) => (
                <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> by {c.author}</li>
              ))}
            </ul>
          </article>
        </>
      );
    case 'about':
    default:
      return (
        <>
          <article className="entry">
            <p>{profile.about}</p>
          </article>
          <article className="entry">
            <header><strong>{education.school}</strong><span>{education.period}</span></header>
            <em>{education.degree} · {education.detail}</em>
          </article>
          <article className="entry">
            <header><strong>Say hello</strong></header>
            <ul className="contact-list">
              <li><a href={`mailto:${profile.email}`}>{profile.email}</a></li>
              <li><a href={profile.links.resume} target="_blank" rel="noreferrer">Résumé · PDF</a></li>
            </ul>
          </article>
        </>
      );
  }
}

// The résumé, filed as a classified pilot dossier.
function Dossier({ onClose }) {
  const identity = [
    ['Name', profile.name],
    ['Callsign', profile.callsign],
    ['Designation', profile.role],
    ['Sector', profile.location],
    ['Academy', education.school],
    ['Programme', education.degree],
    ['Service window', education.period],
    ['Rating', education.detail.split('·')[0].trim()],
  ];
  return (
    <section className="dossier" role="dialog" aria-modal="true" aria-label="Pilot dossier" data-ui>
      <div className="dossier-scrim" onClick={onClose} />
      <article className="dossier-doc">
        <header className="dossier-head">
          <div>
            <p className="mono accent">{dossier.bureau}</p>
            <h2>Pilot dossier</h2>
          </div>
          <div className="dossier-meta mono">
            <span>File {dossier.fileNo}</span>
            <span>Clearance {dossier.clearance}</span>
            <span>Status · {dossier.status}</span>
          </div>
          <button type="button" className="dossier-close mono" onClick={onClose}>Close · Esc</button>
          <span className="stamp" aria-hidden="true">Eyes only</span>
        </header>

        <div className="dossier-body">
          <section className="dossier-section identity">
            <h3 className="mono">00 · Identity</h3>
            <dl className="identity-grid">
              {identity.map(([key, value]) => (
                <div key={key}><dt className="mono">{key}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <p className="dossier-summary">{profile.about}</p>
          </section>

          <section className="dossier-section">
            <h3 className="mono">01 · Service record</h3>
            {experience.map((item) => (
              <article key={item.role + item.period} className="entry">
                <header><strong>{item.role}</strong><span>{item.period}</span></header>
                <em>{item.org} · {item.location}</em>
                <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
              </article>
            ))}
          </section>

          <section className="dossier-section">
            <h3 className="mono">02 · Mission log</h3>
            {projects.map((item) => (
              <article key={item.name} className="entry">
                <header><strong>{item.name}</strong><span>{item.period}</span></header>
                <em>{item.stack}</em>
                <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
              </article>
            ))}
          </section>

          <section className="dossier-section two-col">
            <div>
              <h3 className="mono">03 · Commendations</h3>
              <ul className="plain">{achievements.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div>
              <h3 className="mono">04 · Certifications</h3>
              <ul className="plain">{certifications.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          </section>

          <section className="dossier-section">
            <h3 className="mono">05 · Systems proficiency</h3>
            {skills.map((group) => (
              <div key={group.group} className="skill-row">
                <span className="mono dim">{group.group}</span>
                <div className="chips">{group.items.map((item) => <span key={item}>{item}</span>)}</div>
              </div>
            ))}
          </section>

          <section className="dossier-section">
            <h3 className="mono">06 · Channels</h3>
            <ul className="contact-list">
              <li><a href={`mailto:${profile.email}`}>{profile.email}</a></li>
              <li><a href={profile.links.linkedin} target="_blank" rel="noreferrer">linkedin.com/in/chaitanya-medidar</a></li>
              <li><a href={profile.links.github} target="_blank" rel="noreferrer">github.com/chaitanyamedidar</a></li>
            </ul>
          </section>
        </div>

        <footer className="dossier-foot">
          <span className="mono dim">Compiled from the pilot's résumé. Redistribution requires clearance.</span>
          <a className="dossier-download mono" href={profile.links.resume} target="_blank" rel="noreferrer">Original document · PDF</a>
        </footer>
      </article>
    </section>
  );
}

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <Analytics />
  </>,
);
