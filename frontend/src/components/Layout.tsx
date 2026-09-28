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
  SlidersHorizontal,
  ChevronUp,
  ImageIcon,
  ClipboardList,
  KeyRound,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileManager } from './FileManager';

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
    { name: 'My Desktops', path: '/dashboard', icon: Monitor },
    { name: 'Profile', path: '/profile', icon: UserIcon },
  ];

  const adminNav = [
    { name: 'Admin Overview', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'User Management', path: '/admin/users', icon: Users },
    { name: 'VM Management', path: '/admin/vms', icon: Monitor },
    { name: 'Assignments Matrix', path: '/admin/assignments', icon: SlidersHorizontal },
    { name: 'Audit Report', path: '/admin/audit', icon: ClipboardList },
    { name: 'Customer Logo', path: '/admin/branding', icon: ImageIcon },
    { name: 'License', path: '/admin/license', icon: KeyRound },
    { name: 'User View', path: '/dashboard', icon: Monitor },
    { name: 'Profile', path: '/profile', icon: UserIcon },
  ];

  const navItems = isAdmin ? adminNav : userNav;

  return (
    <div className="flex h-screen w-full flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r flex flex-col justify-between shrink-0 hidden md:flex">
        <div>
          {/* Brand Header */}
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <div className="h-6 w-6 bg-primary/10 text-primary rounded-md flex items-center justify-center">
                <Monitor className="h-4 w-4" />
              </div>
              {/* <span className="">GuacRDP</span> */}
            </Link>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-auto py-2">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                      isActive
                        ? 'bg-muted text-primary'
                        : 'text-muted-foreground hover:text-primary hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* User Card & Logout */}
        <div className="mt-auto p-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-auto p-2">
                <Avatar className="h-8 w-8 mr-2">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.name?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left truncate mr-2 flex-1">
                  <span className="text-sm font-medium truncate w-full">{user?.name}</span>
                  <span className="text-xs text-muted-foreground">{user?.role}</span>
                </div>
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <UserIcon className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex flex-1 flex-col overflow-auto">
        {/* Header (Visible on both mobile and desktop) */}
        <header className="flex h-14 items-center justify-between md:justify-end gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold md:hidden">
            <Monitor className="h-5 w-5 text-primary" />
            {/* <span className="">GuacRDP</span> */}
          </Link>
          <div className="flex items-center gap-4 ml-auto">
            <FileManager />
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

