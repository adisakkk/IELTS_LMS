import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Bell, PanelLeftClose, PanelLeft, Search, ShieldCheck, LogOut, Command } from 'lucide-react';
import { ErrorSurface, LoadingSurface } from '@components/ui';
import { useAdminRootController } from '@admin/hooks/useAdminRootController';
import { AdminProvider } from './AdminContext';

/**
 * AdminRoot Route — Refined shell
 *
 * Route-driven admin layout. Bootstrap and mutation orchestration live in
 * `useAdminRootController`, leaving this file as layout and outlet composition.
 */
export function AdminRoot() {
  const navigate = useNavigate();
  const {
    contextValue,
    currentView,
    initError,
    isInitialized,
    navItems,
    notificationCount,
    reload,
    sidebarOpen,
    setSidebarOpen,
  } = useAdminRootController();

  if (!isInitialized) {
    return <LoadingSurface label="Loading Admin..." />;
  }

  if (initError) {
    return (
      <ErrorSurface
        title="Loading Error"
        description={initError}
        actionLabel="Retry"
        onAction={() => {
          void reload();
        }}
      />
    );
  }

  const activeNavItem = navItems.find((item) => item.id === currentView);

  return (
    <AdminProvider value={contextValue}>
      <div className="flex h-screen w-full bg-gray-50 text-gray-900 font-sans overflow-hidden">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        {/* ──────────────────────────────────────────────
            Sidebar — Refined cream with subtle ink accents
           ────────────────────────────────────────────── */}
        <aside
          className={`flex flex-col bg-white border-r border-gray-100 transition-[width] duration-300 ease-out ${
            sidebarOpen ? 'w-64' : 'w-[72px]'
          } flex-shrink-0 z-20`}
          role="navigation"
          aria-label="Admin navigation"
        >
          {/* Brand */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
            {sidebarOpen ? (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2.5 group"
                aria-label="Axia home"
              >
                <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center font-display italic text-xl leading-none shadow-sm">
                  A
                </div>
                <div className="flex flex-col leading-tight text-left">
                  <span className="font-display text-lg text-gray-900 tracking-tight">Axia</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium">
                    Admin
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => navigate('/admin')}
                className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center font-display italic text-xl leading-none shadow-sm mx-auto"
                aria-label="Axia home"
              >
                A
              </button>
            )}
            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen((open) => !open)}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            )}
          </div>

          {/* Collapse toggle when collapsed */}
          {!sidebarOpen && (
            <div className="px-3 pt-3">
              <button
                onClick={() => setSidebarOpen((open) => !open)}
                className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Expand sidebar"
              >
                <PanelLeft size={16} />
              </button>
            </div>
          )}

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto py-4 no-scrollbar">
            {sidebarOpen && (
              <div className="px-6 mb-2 text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium">
                Workspace
              </div>
            )}
            <nav className="space-y-0.5 px-3" aria-label="Main navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.path)}
                    className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    title={!sidebarOpen ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon
                      size={18}
                      className={`flex-shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-900'
                      }`}
                    />
                    {sidebarOpen ? (
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    ) : null}
                  </button>
                );
              })}

              {/* Divider + Proctor shortcut */}
              <div className="pt-4 mt-2 px-1">
                {sidebarOpen && (
                  <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium">
                    Operations
                  </div>
                )}
                <button
                  onClick={() => navigate('/proctor')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100 transition-all"
                  title={!sidebarOpen ? 'Live Proctoring' : undefined}
                >
                  <ShieldCheck size={18} className="flex-shrink-0" />
                  {sidebarOpen ? (
                    <span className="text-sm font-medium">Live Proctoring</span>
                  ) : null}
                  {sidebarOpen && (
                    <span className="ml-auto flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] uppercase tracking-wider font-semibold">Live</span>
                    </span>
                  )}
                </button>
              </div>
            </nav>
          </div>

          {/* Footer — User + exit */}
          <div className="p-3 border-t border-gray-100">
            {sidebarOpen ? (
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  SC
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">Sarah Chen</div>
                  <div className="text-xs text-gray-500 truncate">Administrator</div>
                </div>
                <button
                  onClick={() => navigate('/')}
                  aria-label="Sign out"
                  className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/')}
                aria-label="Sign out"
                className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </aside>

        {/* ──────────────────────────────────────────────
            Content area
           ────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header
            className="h-16 bg-gray-50/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0 z-10"
            role="banner"
          >
            {/* Left — page title + breadcrumb */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex flex-col leading-tight min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium">
                  <span>Admin</span>
                  <span className="text-gray-300">/</span>
                  <span className="text-gray-700 truncate">{activeNavItem?.label ?? 'Overview'}</span>
                </div>
                <h1 className="font-display text-xl text-gray-900 tracking-tight truncate">
                  {activeNavItem?.label ?? 'Overview'}
                </h1>
              </div>
            </div>

            {/* Right — search + notifications + user */}
            <div className="flex items-center gap-2">
              <div className="relative hidden md:block w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input
                  type="text"
                  placeholder="Search resources, students, exams"
                  className="w-full h-10 pl-10 pr-16 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 outline-none transition-all"
                  aria-label="Search resources, students, exams"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5">
                  <Command size={10} />
                  K
                </span>
              </div>

              <button
                className="relative w-10 h-10 inline-flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {notificationCount > 0 ? (
                  <span className="absolute top-2 right-2 min-w-4 h-4 px-1 bg-red-600 text-white text-[10px] font-semibold rounded-full flex items-center justify-center ring-2 ring-gray-50">
                    {notificationCount}
                  </span>
                ) : null}
              </button>

              <div className="w-px h-6 bg-gray-200 mx-1" />

              <button
                className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full hover:bg-gray-100 transition-colors group"
                aria-label="Account"
              >
                <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold">
                  SC
                </div>
                <div className="hidden md:flex flex-col leading-tight text-left">
                  <span className="text-sm font-medium text-gray-900">Sarah Chen</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Admin</span>
                </div>
              </button>
            </div>
          </header>

          <main
            id="main-content"
            className="flex-1 overflow-y-auto bg-gray-50 p-6 lg:p-8"
            role="main"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}
