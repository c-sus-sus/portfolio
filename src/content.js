// All portfolio copy lives here. The scene and UI read from this file only.
// Wrap a phrase in **double asterisks** to highlight it as a keyword in the reports and dossier.
// Phone number intentionally omitted from the public site.

export const profile = {
  name: 'Chaitanya Medidar',
  firstName: 'Chaitanya',
  callsign: 'PIONEER-01',
  role: 'AI & Data Science engineer',
  location: 'Mumbai, India',
  tagline: 'AI & Data Science · LFX Mentee 2026 at CNCF Meshery · 4x Hackathon Winner',
  headline: 'I build ML systems that ship.',
  intro:
    'Open source contributor across VS Code, Meshery and AnkiDroid. Researching selective training for LLM coding agents. This portfolio is a short flight through my work: press Go, then take the guided tour or fly yourself.',
  about:
    'Final-year B.E. student in Artificial Intelligence & Data Science at VESIT, Mumbai (**CGPA 8.8/10**). **LFX Mentee 2026 at CNCF Meshery** (Linux Foundation Mentorship), open source contributor across **VS Code**, **AnkiDroid** and Hiero Ledger, and currently researching **adaptive selective training for LLM coding agents**.',
  email: 'chaitanya.medidar@gmail.com',
  links: {
    linkedin: 'https://linkedin.com/in/chaitanya-medidar',
    github: 'https://github.com/chaitanyamedidar',
    resume: '/Chaitanya_Medidar_Resume.pdf',
  },
};

export const education = {
  school: "Vivekanand Education Society's Institute of Technology",
  degree: 'B.E. in Artificial Intelligence & Data Science',
  period: 'Aug 2023 – Jun 2027',
  detail: 'CGPA 8.8/10 · Mumbai, India',
};

export const experience = [
  {
    role: 'LFX Mentee 2026',
    org: 'Linux Foundation Mentorship (LFX) · CNCF Meshery',
    period: 'Jun 2026 – Aug 2026',
    location: 'Remote',
    points: [
      'Unified three connection entry points into a shared **Create Connection wizard** in **React and TypeScript**.',
      'Fixed a **query serialization bug** that emptied **Prometheus, Grafana and Kubernetes** views, adding **Vitest tests**.',
      'Deduplicated **MeshSync events** in the **Go server** via **atomic CompareAndSwap** and preserved credential IDs on save.',
      'Resolved an **RJSF password-field crash** and invalid timestamps, and rebuilt the **Kubernetes context switcher**.',
    ],
  },
  {
    role: 'Open Source Contributor',
    org: 'Microsoft VS Code · Falling Fruit · AnkiDroid · Hiero Ledger · Meshery',
    period: 'Dec 2025 – Present',
    location: 'Remote',
    points: [
      'Merged fixes across large projects: **VS Code** UI and settings improvements, **Falling Fruit** frontend UX fixes, **AnkiDroid** validation with **unit test coverage**.',
      'Improved maintainer workflows on **Hiero Ledger and Meshery**: **CI and workflow automation**, adapter tests, documentation fixes, and **security hardening** for workflow and auth handling.',
    ],
  },
];

export const projects = [
  {
    name: 'STAR: Fine-Grained Token Selection for Efficient Coding Agents',
    stack: 'PyTorch · TRL · SWE-bench',
    period: 'Ongoing',
    points: [
      'Designing a **three-phase selective SFT pipeline** extending **Rho-1** to coding agents, prioritizing **error-recovery tokens**.',
      'Traced a null pilot result to a threshold bug dropping **80.6% of 167K recovery tokens**; fixed with a force-keep path.',
      'Froze a **five-type failure taxonomy** from **750 SWE-Lego trajectories**, gating detection at **0.80 per-type precision**.',
    ],
  },
  {
    name: 'NaviSense, Offline Visual Assistance App',
    stack: 'Flutter · YOLOv8n TFLite · ML Kit · Firebase',
    period: 'Mar 2026',
    points: [
      '**Won Hack4Innovation 2026** among **1,500+ participants** with an **offline-first app** for visually impaired users.',
      'Deployed on-device **YOLOv8n hazard detection** for 15 classes and **ML Kit OCR** for **15+ Indian scripts**.',
    ],
  },
  {
    name: 'Vulnerability Detection via QLoRA Fine-Tuning',
    stack: 'Python · QLoRA · Ollama · HuggingFace TRL',
    period: 'May 2026',
    points: [
      'Fine-tuned **Qwen2.5-Coder-1.5B-Instruct** via **4-bit QLoRA** on 4 CVE/CWE datasets, **80 to 81% token accuracy**.',
      'Shipped an **80 MB offline Ollama model** that flags **OWASP flaws** and patches Python and Node.js APIs.',
    ],
  },
  {
    name: 'AI Mock Interview Platform',
    stack: 'Next.js · FastAPI · Gemini 2.5 Flash · VAPI',
    period: 'Nov 2025',
    points: [
      'Built **voice behavioral and live coding interview rounds** with **real-time LLM feedback** through VAPI and Gemini.',
      'Implemented a **SQLite-backed FastAPI service** serving **50+ questions**, with a **Monaco editor** for code assessment.',
    ],
  },
];

export const skills = [
  { group: 'Languages', items: ['Python', 'Go', 'TypeScript', 'JavaScript', 'Java'] },
  { group: 'Web & APIs', items: ['React', 'Next.js', 'Node.js', 'FastAPI', 'REST APIs', 'RTK Query'] },
  { group: 'ML frameworks', items: ['PyTorch', 'TensorFlow', 'Scikit-Learn', 'HuggingFace TRL', 'Ollama', 'TFLite'] },
  { group: 'Techniques applied', items: ['LoRA / QLoRA fine-tuning', 'Selective SFT', 'On-device inference', 'OCR pipelines', 'Prompt and eval design'] },
  { group: 'Cloud & DevOps', items: ['Linux', 'Kubernetes', 'Docker', 'GitHub Actions', 'CI/CD', 'Google Cloud'] },
  { group: 'Data & testing', items: ['SQL', 'SQLite', 'Unit testing', 'Vitest', 'Debugging'] },
];

export const achievements = [
  '**1st Place**: Hackquinox 2.0, Hack4Innovation 2026, GDG VESIT TechSprint, Ideathon 2025 (**71% finalist rate**).',
  '**Top 125 of 800+** at Cardano Asia IBW 2025.',
  '**3rd Place**, Kewalramani Public Speaking, Jai Hind College.',
  '**Head of Design**, VESLit Circle, VESIT. **Tech Officer** at MBFTL, VESIT.',
];

export const certifications = [
  '**Google Cloud**: Basics of Google Cloud Compute, Set Up a Google Cloud Network, Monitoring in Google Cloud',
  '**AWS Academy**: Cloud Foundations',
  '**Microsoft Certified**: Azure AI Fundamentals',
  '**NVIDIA**: Fundamentals of Deep Learning',
];

// Stations in flight order. `position` is world space in the 3D route (the ship starts near the
// origin and flies toward +Z); `radius` is the body's visual size in scene units.
// Models are the Sketchfab planets packed into public/models/planets/.
export const stations = [
  {
    id: 'about',
    index: '01',
    label: 'About',
    title: 'Home star',
    blurb: 'Who I am, where I study, and what I am looking for.',
    color: '#ffd28a',
    kind: 'star',
    model: null,
    radius: 11,
    position: [46, 16, 96],
    spin: 0.03,
    tilt: 0,
    animate: true,
  },
  {
    id: 'experience',
    index: '02',
    label: 'Experience',
    title: 'Flight records',
    blurb: 'Mentorship at CNCF Meshery and merged contributions across major open source projects.',
    color: '#7dd3fc',
    kind: 'planet',
    model: '/models/planets/betahydri.glb',
    exposure: 1.35,
    radius: 4.6,
    position: [-42, -3, 150],
    spin: 0.05,
    tilt: 0.25,
  },
  {
    id: 'projects',
    index: '03',
    label: 'Projects',
    title: 'Build archives',
    blurb: 'LLM training research, on-device vision, security fine-tuning and interview tooling.',
    color: '#c084fc',
    kind: 'planet',
    model: '/models/planets/purple.glb',
    emissive: 0.12,
    exposure: 0.82,
    radius: 5.2,
    position: [56, 10, 214],
    spin: 0.04,
    tilt: -0.2,
    animate: true,
  },
  {
    id: 'skills',
    index: '04',
    label: 'Skills & awards',
    title: 'Systems matrix',
    blurb: 'What I have actually used in shipped work, then the wins and certifications that back it up.',
    color: '#34d399',
    kind: 'planet',
    model: '/models/planets/serendip.glb',
    radius: 4.0,
    position: [-26, 20, 278],
    spin: 0.07,
    tilt: -0.3,
  },
  {
    id: 'contact',
    index: '05',
    label: 'Contact',
    title: 'Open channel',
    blurb: 'Email, profiles and the résumé. The fastest way to reach me.',
    color: '#fbbf24',
    kind: 'planet',
    model: '/models/planets/phoenix.glb',
    radius: 4.3,
    position: [14, 30, 350],
    spin: 0.06,
    tilt: 0.35,
  },
];

// Framing for the résumé overlay.
export const dossier = {
  bureau: 'Pioneer Fleet · Personnel Bureau',
  fileNo: 'PF-2027-0819',
  clearance: 'Level 05',
  status: 'Active · available for missions',
};

// Attribution required by the CC-BY licenses of the Sketchfab assets.
export const credits = [
  { title: 'SPACESHIP - CB2', author: 'Lezalit', url: 'https://sketchfab.com/3d-models/spaceship-cb2-b9708d29e85746c891b48075a8a1e70a' },
  { title: 'Earth', author: 'AirStudios', url: 'https://sketchfab.com/3d-models/earth-5f9c35be31a047928eace8b415a8ee3a' },
  { title: 'Planet Beta Hydri', author: 'Duael', url: 'https://sketchfab.com/3d-models/planet-beta-hydri-free-sample-8430b71ced264065bcb3d2afb7086470' },
  { title: 'Purple Planet', author: 'Yo.Ri', url: 'https://sketchfab.com/3d-models/purple-planet-264eb22207184fc99a5e3b1279a763b8' },
  { title: 'Planet Of Phoenix', author: 'ARCTIC WOLVES', url: 'https://sketchfab.com/3d-models/planet-of-phoenix-bbe2737a863445f7bb2a6901d10b090a' },
  { title: 'Planet Serendip', author: 'Duael', url: 'https://sketchfab.com/3d-models/planet-serendip-free-sample-b80dd5f7375448ceb60fc63bce90814f' },
];
