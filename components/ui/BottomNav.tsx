'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Target, CheckSquare, StickyNote, Calendar, Bot, Settings } from 'lucide-react'

const navItems = [
  { icon: <LayoutDashboard size={20} />, label: 'Главная', href: '/dashboard' },
  { icon: <Target size={20} />, label: 'Цели', href: '/goals' },
  { icon: <CheckSquare size={20} />, label: 'Привычки', href: '/habits' },
  { icon: <StickyNote size={20} />, label: 'Заметки', href: '/notes' },
]

const moreItems = [
  { icon: <Calendar size={20} />, label: 'Календарь', href: '/calendar' },
  { icon: <Bot size={20} />, label: 'AI', href: '/ai' },
  { icon: <Settings size={20} />, label: 'Настройки', href: '/settings' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-[#111118] border-t border-[#2a2a4a] px-2 py-1.5 max-w-md mx-auto z-50">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 py-1 px-2.5 relative group">
                {isActive && <span className="absolute -top-1.5 w-4 h-0.5 rounded-full bg-[#3b82f6]" />}
                <span className={`transition-all duration-200 ${isActive ? 'text-[#3b82f6] scale-110' : 'text-[#444466] group-hover:text-[#666688]'}`}>
                  {item.icon}
                </span>
                <span className={`text-[9px] font-medium transition-all duration-200 ${isActive ? 'text-[#3b82f6]' : 'text-[#444466] group-hover:text-[#666688]'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          <div className="relative group">
            <button className="flex flex-col items-center gap-0.5 py-1 px-2.5">
              <span className="text-[#444466] group-hover:text-[#666688] text-xl leading-none">•••</span>
              <span className="text-[9px] font-medium text-[#444466] group-hover:text-[#666688]">Ещё</span>
            </button>
            
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-2 shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 min-w-35">
              {moreItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link key={item.href} href={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-[#3b82f6]/10 text-[#3b82f6]' : 'text-[#8888aa] hover:bg-[#2a2a4a] hover:text-white'}`}>
                    <span className={isActive ? 'text-[#3b82f6]' : 'text-[#555577]'}>{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </nav>
      <div className="h-20" />
    </>
  )
}