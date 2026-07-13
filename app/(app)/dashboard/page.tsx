'use client'

import React, { useState } from 'react'
import { Target, CheckSquare, Flame, Bot, ArrowRight, Plus } from 'lucide-react'

export default function DashboardPage() {
  const [tasks, setTasks] = useState([
    { id: 1, label: 'Завершить дашборд', completed: true },
    { id: 2, label: 'Прочитать 20 страниц', completed: true },
    { id: 3, label: 'Пойти на прогулку', completed: false },
    { id: 4, label: 'Написать заметку', completed: false },
    { id: 5, label: 'Медитация 10 мин', completed: false },
  ])

  const toggleTask = (id: number) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ))
  }

  const completedCount = tasks.filter(t => t.completed).length

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Приветствие */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Привет! 👋</h1>
          <p className="text-[#666688] text-sm mt-0.5">Сегодня отличный день для продуктивности</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-full px-3 py-1.5 flex items-center gap-2 border border-[#2a2a4a]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="text-xs text-[#8888aa]">Онлайн</span>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#161625] border border-[#2a2a4a] rounded-xl p-4 hover:border-[#3b82f6] transition-all">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-[#3b82f6]" />
            <span className="text-xs text-[#666688]">Цели</span>
          </div>
          <p className="text-2xl font-bold text-white">12</p>
          <p className="text-xs text-emerald-400">+2 за неделю</p>
        </div>
        
        <div className="bg-[#161625] border border-[#2a2a4a] rounded-xl p-4 hover:border-[#3b82f6] transition-all">
          <div className="flex items-center gap-2 mb-2">
            <CheckSquare size={16} className="text-[#3b82f6]" />
            <span className="text-xs text-[#666688]">Привычки</span>
          </div>
          <p className="text-2xl font-bold text-white">7/9</p>
          <p className="text-xs text-emerald-400">+3 сегодня</p>
        </div>
      </div>

      {/* Задачи */}
      <div className="bg-[#161625] border border-[#2a2a4a] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white">Сегодня</h3>
            <span className="text-xs text-[#666688]">{completedCount} из {tasks.length}</span>
          </div>
          <button className="p-1 rounded-lg hover:bg-[#2a2a4a] transition-colors">
            <Plus size={16} className="text-[#666688]" />
          </button>
        </div>
        
        <div className="space-y-2">
          {tasks.map((task) => (
            <div 
              key={task.id} 
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors cursor-pointer" 
              onClick={() => toggleTask(task.id)}
            >
              <div className={`w-5 h-5 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all ${
                task.completed 
                  ? 'bg-[#3b82f6] border-[#3b82f6]' 
                  : 'border-[#3a3a5a] hover:border-[#3b82f6]'
              }`}>
                {task.completed && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm transition-all ${
                task.completed ? 'text-[#666688] line-through' : 'text-[#a8a8c8]'
              }`}>
                {task.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Подсказка */}
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#161625] border border-[#2a2a4a] rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">
            <Bot size={18} className="text-[#3b82f6]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-white">AI Ассистент</span>
              <span className="text-[10px] text-emerald-400 font-medium animate-pulse-dot">● online</span>
            </div>
            <p className="text-sm text-[#8888aa] leading-relaxed">
              "Доброе утро! Сегодня отличный день для продуктивности. 
              У вас 3 активные цели и 2 привычки на сегодня."
            </p>
          </div>
        </div>
      </div>

      {/* Профиль */}
      <div className="flex items-center justify-between bg-[#161625] border border-[#2a2a4a] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#2563eb] flex items-center justify-center text-white font-medium text-base shadow-lg shadow-[#3b82f6]/20">
            A
          </div>
          <div>
            <p className="text-sm font-medium text-white">Алексей</p>
            <p className="text-xs text-[#666688]">@alexey</p>
          </div>
        </div>
        <a 
          href="/settings" 
          className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors flex items-center gap-1"
        >
          Настройки <ArrowRight size={12} />
        </a>
      </div>
    </div>
  )
}