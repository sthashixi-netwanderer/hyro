import React from 'react'
import { Sun, Moon, Monitor, Check, Palette } from 'lucide-react'
import { useTheme, Theme } from '../../context/ThemeContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  variant?: 'sidebar' | 'compact' | 'inline'
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export default function ThemeToggle({
  variant = 'sidebar',
  align = 'end',
  side = 'right',
  className
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode; description: string }[] = [
    {
      value: 'light',
      label: 'Light',
      icon: <Sun className="size-4 text-amber-500" />,
      description: 'Clean bright layout'
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: <Moon className="size-4 text-emerald-400" />,
      description: 'Deep Spotify dark theme'
    },
    {
      value: 'system',
      label: 'System Default',
      icon: <Monitor className="size-4 text-blue-400" />,
      description: 'Sync with operating system'
    }
  ]

  const currentIcon =
    theme === 'light' ? (
      <Sun className="size-4 text-amber-500" />
    ) : theme === 'dark' ? (
      <Moon className="size-4 text-emerald-400" />
    ) : (
      <Monitor className="size-4 text-blue-400" />
    )

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-1.5 p-1 rounded-xl bg-accent/40 border border-border/50', className)}>
        {themeOptions.map((opt) => {
          const isActive = theme === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none',
                isActive
                  ? 'bg-card text-foreground shadow-sm font-semibold border border-border/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              )}
            >
              {opt.icon}
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent', className)}
            title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (Active: ${resolvedTheme})`}
          >
            {currentIcon}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} side={side} className="w-48 z-[200]">
          <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5 font-normal">
            <Palette className="size-3.5 text-primary" /> Appearance
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {themeOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => setTheme(opt.value)}
              onClick={() => setTheme(opt.value)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <div className="flex items-center gap-2.5">
                {opt.icon}
                <span className={cn(theme === opt.value && 'font-semibold text-foreground')}>
                  {opt.label}
                </span>
              </div>
              {theme === opt.value && <Check className="size-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Sidebar variant
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3 px-3 text-sm font-medium text-secondary-foreground hover:text-foreground hover:bg-accent/80 transition-colors',
            className
          )}
        >
          <div className="size-5 flex items-center justify-center shrink-0">
            {currentIcon}
          </div>
          <span className="truncate">Theme</span>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/60 text-muted-foreground border border-border/30">
            {theme === 'system' ? 'System' : theme}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-52 z-[200]">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
          <Palette className="size-3.5 text-primary" /> Select App Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themeOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => setTheme(opt.value)}
            onClick={() => setTheme(opt.value)}
            className="flex items-center justify-between cursor-pointer py-2 px-2.5"
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5">{opt.icon}</div>
              <div className="flex flex-col">
                <span className={cn('text-xs', theme === opt.value ? 'font-semibold text-foreground' : 'text-foreground/80')}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground/70">{opt.description}</span>
              </div>
            </div>
            {theme === opt.value && <Check className="size-3.5 text-primary shrink-0 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
