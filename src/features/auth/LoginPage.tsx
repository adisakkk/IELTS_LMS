import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles, Users, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'admin' | 'proctor' | 'student'>('admin');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'proctor') navigate('/proctor');
    else if (role === 'student') navigate('/admin');
    else navigate('/admin');
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 grid lg:grid-cols-[1.05fr_1fr]">
      {/* ──────────────────────────────────────────────
          Left — Editorial hero
         ────────────────────────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 text-white bg-ink-mesh bg-grain overflow-hidden">
        {/* Decorative ornament */}
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-white/5 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 w-[420px] h-[420px] rounded-full bg-amber-500/10 blur-3xl" />

        {/* Brand mark */}
        <header className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center">
            <span className="font-display text-2xl leading-none italic tracking-tight">A</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-xl tracking-tight">Axia</span>
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/60 font-medium">Examination Platform</span>
          </div>
        </header>

        {/* Editorial copy */}
        <div className="relative max-w-xl space-y-8 animate-fade-in-up">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/60 font-medium">
            <Sparkles size={14} className="text-amber-300" />
            The modern IELTS workspace
          </p>
          <h1 className="font-display text-5xl xl:text-6xl leading-[1.02] tracking-tight text-balance">
            Precision, proctoring, and poise — in a single studio.
          </h1>
          <p className="text-base xl:text-lg text-white/70 leading-relaxed max-w-lg text-pretty">
            Author exams, monitor live cohorts, and grade with confidence. Axia brings the craft of language
            assessment into a calm, modern environment built for examiners who care about detail.
          </p>

          {/* Stat row */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10 max-w-md">
            <div>
              <div className="font-display text-3xl">12k+</div>
              <div className="text-xs text-white/60 mt-1">Candidates proctored</div>
            </div>
            <div>
              <div className="font-display text-3xl">98.7%</div>
              <div className="text-xs text-white/60 mt-1">Grading consistency</div>
            </div>
            <div>
              <div className="font-display text-3xl">24 / 7</div>
              <div className="text-xs text-white/60 mt-1">Live support</div>
            </div>
          </div>
        </div>

        {/* Testimonial card */}
        <figure className="relative max-w-md p-6 rounded-2xl bg-white/[0.06] backdrop-blur-sm border border-white/10">
          <blockquote className="font-display text-lg leading-snug text-white/95 italic">
            &ldquo;Axia replaced three disjointed tools with a single, beautiful workflow. Our examiners
            onboard in an afternoon.&rdquo;
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-300/20 flex items-center justify-center text-sm font-medium text-amber-100">
              MK
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Maya Kaur</span>
              <span className="text-xs text-white/55">Director of Assessment · Meridian Language Institute</span>
            </div>
          </figcaption>
        </figure>
      </aside>

      {/* ──────────────────────────────────────────────
          Right — Sign-in form
         ────────────────────────────────────────────── */}
      <main className="relative flex items-center justify-center p-6 sm:p-10">
        {/* Mobile brand mark */}
        <div className="lg:hidden absolute top-6 left-6 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center font-display italic text-xl">
            A
          </div>
          <span className="font-display text-lg">Axia</span>
        </div>

        <div className="w-full max-w-md animate-fade-in-up">
          <div className="mb-10">
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight text-gray-900">
              Welcome back.
            </h2>
            <p className="mt-3 text-gray-600 text-pretty">
              Sign in to continue to your examination workspace.
            </p>
          </div>

          {/* Role selector — premium segmented control */}
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium mb-2">Continue as</div>
            <div
              role="tablist"
              aria-label="Select role"
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 border border-gray-200"
            >
              {([
                { id: 'admin', label: 'Admin', icon: ShieldCheck },
                { id: 'proctor', label: 'Proctor', icon: Users },
                { id: 'student', label: 'Student', icon: Sparkles },
              ] as const).map((opt) => {
                const Icon = opt.icon;
                const active = role === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRole(opt.id)}
                    className={`flex items-center justify-center gap-2 h-9 text-sm font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={14} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full h-11 pl-10 pr-3 rounded-lg bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-900">
                  Password
                </label>
                <a href="#" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-10 rounded-lg bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-md"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember */}
            <label className="flex items-center gap-2.5 select-none cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
              />
              <span className="text-sm text-gray-600">Keep me signed in on this device</span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              className="group w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white font-medium text-sm transition-all hover:bg-gray-800 active:bg-black shadow-sm hover:shadow-md"
            >
              Sign in
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          {/* Divider + SSO */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs uppercase tracking-wider text-gray-500 bg-gray-50">
                or continue with
              </span>
            </div>
          </div>

          <button
            type="button"
            className="w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-lg bg-white text-gray-900 font-medium text-sm border border-gray-200 transition-all hover:bg-gray-50 hover:border-gray-300"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google SSO
          </button>

          <p className="mt-8 text-center text-xs text-gray-500">
            Demo environment — enter any credentials to explore the platform.
          </p>
        </div>
      </main>
    </div>
  );
}
