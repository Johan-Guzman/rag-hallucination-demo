'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FlaskConical,
  GitCompare,
  FileText,
  BookOpen,
  FolderOpen,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const NAVIGATION = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Documents', href: '/documents', icon: FolderOpen },
  // Single consolidated experiments section: batch runs + charts + a quick
  // single-query runner. The old standalone /experiment page was folded in here.
  { name: 'Experiments', href: '/experiments', icon: ClipboardList },
  { name: 'Compare', href: '/compare', icon: GitCompare },
  { name: 'Paper Analysis', href: '/paper-analysis', icon: FileText },
  { name: 'Research Basis', href: '/research-basis', icon: BookOpen },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 hidden h-screen border-r border-border/70 bg-card/85 backdrop-blur-xl transition-[width] duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-border/70 px-3">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <FlaskConical className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold tracking-tight">RAG Lab</span>
            </div>
          )}
          <button
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {NAVIGATION.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="border-t border-border/70 p-4">
            <p className="text-[11px] leading-4 text-muted-foreground">
              Research environment for evaluating grounded generation.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
