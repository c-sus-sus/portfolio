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

// Turns **keyword** markers from content.js into highlighted spans so a reader can skim.
function rich(text) {
  return String(text).split('**').map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

// Decrypt-style reveal: the text starts as random glyphs and resolves left to right. Plays
// again whenever the text changes. Honours the reduced-motion setting.
const GLYPHS = '!<>-_\/[]{}=+*^?#0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// Short and quiet: the text resolves left to right in about 600 ms whatever its length, and only
// a three-character window ahead of the resolved part flickers; the rest is held as blank space
// so the line keeps its width and nothing jumps.
const GLYPH_WINDOW = 3;
const REVEAL_MS = 600;
const hold = (text) => String(text).replace(/[^ ]/g, ' ');
function Scramble({ text, delay = 0, as: Tag = 'span', className }) {
  const [shown, setShown] = useState(() => (delay > 0 ? hold(text) : text));
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(text); return undefined; }
    const target = String(text);
    const stepMs = Math.max(16, REVEAL_MS / Math.max(1, target.length));
    let settled = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      const tick = () => {
        settled += 1;
        let out = '';
        for (let i = 0; i < target.length; i += 1) {
          const ch = target[i];
          if (i < settled || ch === ' ' || ch === '·') out += ch;
          else if (i < settled + GLYPH_WINDOW) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          else out += ' ';
        }
        setShown(out);
        if (settled < target.length) timer = window.setTimeout(tick, stepMs);
        else setShown(target);
      };
      tick();
    }, delay);
    return () => { window.clearTimeout(start); window.clearTimeout(timer); };
  }, [text, delay]);
  return <Tag className={className} aria-label={String(text)}>{shown}</Tag>;
}

const HERO_STOPS = stations.map((s) => `${s.index} ${s.label}`);

// Cycles through a list, decrypting each item in turn like a departures board.
function CycleText({ items, every = 2200, className }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % items.length), every);
    return () => window.clearInterval(timer);
  }, [items, every]);
  return <Scramble className={className} text={items[index]} />;
}

// Short prompts shown one at a time. `seconds` marks a prompt that clears on a timer; the others
// clear when the visitor performs the action.
const COACH = {
  edge: { id: 'edge', kind: 'alert', step: 'Nav limit', desktop: 'Leaving the charted sector. Autopilot is bringing you about.', touch: 'Leaving the charted sector. Autopilot is bringing you about.' },
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
            <dt>guided tour</dt>
            <dd>the autopilot flies you station to station; press Next when you have read each one</dd>
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
            <dd>Résumé in the top bar opens the pilot dossier: the whole résumé on one page, with the <a href={profile.links.resume} target="_blank" rel="noreferrer">original PDF</a> at the bottom</dd>
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
    // Remembered for the current visit only, so a returning visitor is guided again.
    try { window.localStorage.removeItem('pioneer-coach'); return window.sessionStorage.getItem('pioneer-coach') === 'done' ? { all: true } : {}; } catch { return {}; }
  });
  const [returning, setReturning] = useState(false);
  const [graphicsDown, setGraphicsDown] = useState(null);
  // How the visitor moves through the archive: null = still choosing, 'tour' = autopilot with
  // Next / Previous, 'solo' = free flight.
  const [travelMode, setTravelMode] = useState(null);
  const tourTarget = useRef(null);

  useEffect(() => {
    const startedAt = performance.now();
    // If an asset never arrives, do not leave the visitor on the loader forever.
    const failsafe = window.setTimeout(() => {
      setProgress(100);
      setPhase((current) => (current === 'loading' ? 'orbit' : current));
    }, 20000);
    let api;
    try {
      api = createSpaceScene(canvasRef.current, {
      onGraphicsLost: () => setGraphicsDown('lost'),
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
    } catch (error) {
      // No WebGL (old device, disabled hardware acceleration): fall back to a plain page.
      window.clearTimeout(failsafe);
      setGraphicsDown('unsupported');
      return undefined;
    }
    sceneApi.current = api;
    return () => {
      window.clearTimeout(failsafe);
      api.dispose();
    };
  }, []);

  useEffect(() => {
    sceneApi.current?.setPhase(phase);
  }, [phase]);

  // The dossier takes over input while it is open.
  useEffect(() => {
    sceneApi.current?.setInputLocked(dossierOpen || helpOpen || (phase === 'universe' && travelMode !== 'solo'));
    if (!dossierOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setDossierOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dossierOpen, helpOpen, phase, travelMode]);

  // Every arrival in the archive starts with the choice again.
  useEffect(() => {
    if (phase === 'universe') { setTravelMode(null); tourTarget.current = null; }
  }, [phase]);

  const tourIndex = useMemo(() => {
    const id = flight.station || tourTarget.current;
    return id ? stations.findIndex((s) => s.id === id) : -1;
  }, [flight.station, flight.mode]);
  const tourBusy = flight.mode === 'transit' || flight.mode === 'docking';
  const tourGo = useCallback((index) => {
    const station = stations[index];
    if (!station) return;
    tourTarget.current = station.id;
    sceneApi.current?.jumpTo(station.id);
  }, []);
  const startTour = useCallback(() => {
    setTravelMode('tour');
    // Already docked somewhere: continue the tour from here rather than flying back to the start.
    if (flight.station) tourTarget.current = flight.station;
    else tourGo(0);
  }, [tourGo, flight.station]);
  const startSolo = useCallback(() => { setTravelMode('solo'); }, []);

  useEffect(() => {
    if (!helpOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setHelpOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  // Which prompt, if any, the visitor needs right now.
  const coach = useMemo(() => {
    if (travelMode !== 'solo') return null;
    if (phase === 'universe' && flight.mode === 'flight' && flight.edge && !helpOpen && !dossierOpen) return COACH.edge;
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
  }, [phase, coachSeen, helpOpen, dossierOpen, flight.mode, flight.moved, flight.docked, flight.dockable, flight.left, flight.edge, travelMode]);

  useEffect(() => {
    if (!coach?.seconds) return undefined;
    const timer = window.setTimeout(() => {
      setCoachSeen((seen) => {
        const next = { ...seen, [coach.id]: true };
        if (coach.id === 'more') {
          next.all = true;
          try { window.sessionStorage.setItem('pioneer-coach', 'done'); } catch { /* storage blocked */ }
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
    <main className={`app phase-${phase} ${isTouch ? 'touch' : ''} mode-${travelMode || 'choose'} ${flight.mode === 'orbit' ? 'in-orbit' : ''} ${flight.mode === 'orbit' || flight.mode === 'docking' ? 'focus' : ''} ${dossierOpen ? 'dossier-open' : ''} ${returning ? 'returning' : ''}`}>
      <canvas ref={canvasRef} className="space-canvas" aria-hidden="true" />

      {phase === 'loading' && (
        <section className="loader" aria-label="Loading">
          <div className="loader-top">
            <span className="wordmark">{profile.name}</span>
            <span className="mono dim">{profile.role}</span>
          </div>
          <div className="loader-count">
            <span className="loader-number">{String(progress).padStart(3, '0')}</span>
            <span className="mono dim">Pre-flight checks</span>
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
            <button type="button" className={`topnav-btn ${helpOpen ? 'active' : ''}`} onClick={() => setHelpOpen((open) => !open)}>
              Help
            </button>
            <button type="button" className={`topnav-btn keep resume-btn ${dossierOpen ? 'active' : ''}`} onClick={() => setDossierOpen((open) => !open)}>
              Résumé
            </button>
          </nav>
        </header>
      )}

      {(phase === 'orbit' || phase === 'launch') && (
        <section className="hero" data-ui>
          <div className="hero-copy">
            <ul className="hero-tags mono" aria-label="Summary">
              {profile.tagline.split(' · ').map((tag) => <li key={tag} ref={(el) => { if (el) el.style.setProperty('--w', `${el.offsetWidth}px`); }}><i className="star-top" /><i className="star-bottom" /><span className="shiny">{tag}</span></li>)}
            </ul>
            <h1 aria-label={profile.headline}>
              {headlineWords.map((word, index) => (
                <span
                  key={`${word}-${index}`}
                  className="w"
                  style={{ '--i': index }}
                  aria-hidden="true"
                  ref={(el) => {
                    if (!el) return;
                    const measure = () => {
                      el.style.setProperty('--off', `${el.offsetLeft}px`);
                      el.style.setProperty('--line', `${el.parentElement.clientWidth}px`);
                    };
                    measure();
                    window.addEventListener('resize', measure);
                  }}
                >{word}&nbsp;</span>
              ))}
            </h1>
            <p className="lede">{profile.intro}</p>
          </div>
          <button ref={goRef} className="go" onClick={initiateJump} aria-label="Start: fly through the portfolio">
            <span className="go-ring" />
            <span className="go-label">Go</span>
            <span className="go-sub mono">Start the flight</span>
          </button>
          <div className="go-stops mono" aria-label="Stops: About, Experience, Projects, Skills and awards, Contact">
            <span className="dim">Stops</span>
            <CycleText className="hero-stop" items={HERO_STOPS} />
          </div>
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
          <Scramble as="h2" text="Crossing to the archive" />
          <div className="warp-line"><i /></div>
        </section>
      )}

      {phase === 'universe' && travelMode === null && (
        <section className="choose" data-ui aria-label="How would you like to explore?">
          <p className="mono accent">You have arrived</p>
          <Scramble as="h2" delay={1000} text="How would you like to explore?" />
          <div className="choose-options">
            <button type="button" className="choose-card primary" onClick={startTour} autoFocus>
              <strong>Guided tour</strong>
              <span>The ship flies itself through all five sections of this portfolio in order: About, Experience, Projects, Skills & awards, Contact. Each opens as you arrive. Read it, press Next.</span>
              <em className="mono">Recommended · about 3 minutes</em>
            </button>
            <button type="button" className="choose-card" onClick={startSolo}>
              <strong>Fly solo</strong>
              <span>Pilot the ship yourself. Steer to any section and dock to read it. The black hole takes you back to Earth.</span>
              <em className="mono">{isTouch ? 'Joystick and thrust' : 'Cursor, W, Shift, Space'}</em>
            </button>
          </div>
          <p className="mono dim">You can switch at any time.</p>
        </section>
      )}

      {phase === 'universe' && (
        <section className="route" data-ui>
          <div className="route-head">
            <p className="mono accent">Mission route</p>
            <Scramble as="h2" className="route-title" text={activeStation ? activeStation.title : 'Fly to a station'} />
          </div>

          {coach && (
            <p key={coach.id} className="coach mono" data-kind={coach.kind || 'tip'} role="status">
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
                  <button className="holo-close mono" onClick={() => sceneApi.current?.leaveOrbit()} title="Close this section and fly on">Leave orbit</button>
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

          {travelMode === 'tour' && (
            <nav className="tour-bar" aria-label="Guided tour">
              <button type="button" className="mono" disabled={tourBusy || tourIndex <= 0} onClick={() => tourGo(tourIndex - 1)}>◀ Prev</button>
              <span className="tour-pos">
                <Scramble as="strong" text={tourIndex >= 0 ? stations[tourIndex].label : 'En route'} />
                <span className="mono dim">{tourIndex >= 0 ? `${tourIndex + 1} of ${stations.length}` : ''}</span>
              </span>
              {tourIndex < stations.length - 1 ? (
                <button type="button" className="mono next" disabled={tourBusy} onClick={() => tourGo(tourIndex + 1)}>Next ▶</button>
              ) : (
                <button type="button" className="mono next" disabled={tourBusy} onClick={() => sceneApi.current?.returnToHero()}>Return to orbit</button>
              )}
              <button type="button" className="mono solo" onClick={startSolo}>Fly solo</button>
            </nav>
          )}
          {travelMode === 'solo' && (
            <button type="button" className="tour-switch mono" data-ui onClick={startTour}>Guided tour</button>
          )}

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

      {graphicsDown && (
        <section className="fallback" data-ui>
          <p className="mono accent">{graphicsDown === 'lost' ? 'Graphics connection lost' : '3D is not available on this device'}</p>
          <h2>{profile.headline}</h2>
          <p>{graphicsDown === 'lost'
            ? 'Your browser stopped the 3D scene. Reload to fly again, or read everything below.'
            : 'This browser cannot run the 3D scene, so here is everything in plain form.'}</p>
          <div className="fallback-actions">
            <button type="button" onClick={() => setDossierOpen(true)}>Open résumé</button>
            <a href={profile.links.resume} target="_blank" rel="noreferrer">Download PDF</a>
            {graphicsDown === 'lost' && <button type="button" onClick={() => window.location.reload()}>Reload</button>}
          </div>
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
          <ul>{item.points.map((point) => <li key={point}>{rich(point)}</li>)}</ul>
        </article>
      ));
    case 'projects':
      return projects.map((item) => (
        <article key={item.name} className="entry">
          <header><strong>{item.name}</strong><span>{item.period}</span></header>
          <em>{item.stack}</em>
          <ul>{item.points.map((point) => <li key={point}>{rich(point)}</li>)}</ul>
        </article>
      ));
    case 'skills':
      return (
        <>
          <article className="entry">
            <p>Languages, frameworks and techniques I have used in shipped work, not a checklist. Each item below appears in at least one project or contribution above.</p>
          </article>
          {skills.map((group) => (
            <article key={group.group} className="entry">
              <header><strong>{group.group}</strong></header>
              <div className="chips">{group.items.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
          ))}
          <article className="entry">
            <header><strong>Achievements</strong></header>
            <ul>{achievements.map((line) => <li key={line}>{rich(line)}</li>)}</ul>
          </article>
          <article className="entry">
            <header><strong>Certifications</strong></header>
            <ul>{certifications.map((line) => <li key={line}>{rich(line)}</li>)}</ul>
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
              <li><button type="button" className="linklike" onClick={onOpenDossier}>Résumé · pilot dossier with PDF</button></li>
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
            <p>{rich(profile.about)}</p>
          </article>
          <article className="entry">
            <header><strong>{education.school}</strong><span>{education.period}</span></header>
            <em>{education.degree} · {education.detail}</em>
          </article>
          <article className="entry">
            <header><strong>Say hello</strong></header>
            <ul className="contact-list">
              <li><a href={`mailto:${profile.email}`}>{profile.email}</a></li>
              <li><button type="button" className="linklike" onClick={onOpenDossier}>Résumé · pilot dossier with PDF</button></li>
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
            <h2>Résumé <span className="dossier-sub">· Pilot dossier</span></h2>
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
            <p className="dossier-summary">{rich(profile.about)}</p>
          </section>

          <section className="dossier-section">
            <h3 className="mono">01 · Service record</h3>
            {experience.map((item) => (
              <article key={item.role + item.period} className="entry">
                <header><strong>{item.role}</strong><span>{item.period}</span></header>
                <em>{item.org} · {item.location}</em>
                <ul>{item.points.map((point) => <li key={point}>{rich(point)}</li>)}</ul>
              </article>
            ))}
          </section>

          <section className="dossier-section">
            <h3 className="mono">02 · Mission log</h3>
            {projects.map((item) => (
              <article key={item.name} className="entry">
                <header><strong>{item.name}</strong><span>{item.period}</span></header>
                <em>{item.stack}</em>
                <ul>{item.points.map((point) => <li key={point}>{rich(point)}</li>)}</ul>
              </article>
            ))}
          </section>

          <section className="dossier-section two-col">
            <div>
              <h3 className="mono">03 · Commendations</h3>
              <ul className="plain">{achievements.map((line) => <li key={line}>{rich(line)}</li>)}</ul>
            </div>
            <div>
              <h3 className="mono">04 · Certifications</h3>
              <ul className="plain">{certifications.map((line) => <li key={line}>{rich(line)}</li>)}</ul>
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
          <span className="mono dim">This page is the résumé. The original document is one click away.</span>
          <a className="dossier-download mono" href={profile.links.resume} target="_blank" rel="noreferrer">Download résumé · PDF</a>
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
