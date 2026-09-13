import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { logoutUser } from '../store/authSlice';
import { 
  Monitor, 
  Users, 
  LogOut, 
  User as UserIcon, 
  LayoutDashboard, 
  SlidersHorizontal
} from 'lucide-react';

export const Layout: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  const isAdmin = user?.role === 'ADMIN';

  const userNav = [
    { name: 'My Remote Desktops', path: '/dashboard', icon: Monitor },
    { name: 'Profile', path: '/profile', icon: UserIcon },
  ];

  const adminNav = [
    { name: 'Admin Overview', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'User Management', path: '/admin/users', icon: Users },
    { name: 'VM Management', path: '/admin/vms', icon: Monitor },
    { name: 'Assignments Matrix', path: '/admin/assignments', icon: SlidersHorizontal },
    { name: 'User Dashboard View', path: '/dashboard', icon: Monitor },
    { name: 'Profile', path: '/profile', icon: UserIcon },
  ];

  const navItems = isAdmin ? adminNav : userNav;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Header */}
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="p-2 bg-sky-600/20 text-sky-400 rounded-lg border border-sky-500/30">
              <Monitor className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">GuacRDP</h1>
              <p className="text-xs text-slate-400">Remote Desktop Gateway</p>
            </div>
          </div>

          {/* Nav items */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="h-9 w-9 rounded-full bg-sky-600 flex items-center justify-center font-bold text-white uppercase text-sm shrink-0">
                {user?.name?.[0] || 'U'}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                <div className="flex items-center space-x-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                    isAdmin ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-auto">
        <div className="p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
