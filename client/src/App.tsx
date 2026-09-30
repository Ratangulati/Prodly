import { useEffect } from 'react'
import AppShell from '@/components/AppShell'
import AuthScreen from '@/components/auth/AuthScreen'
import AppSkeleton from '@/components/ui/AppSkeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/lib/auth'

export default function App() {
  const { status, check } = useAuthStore()

  useEffect(() => { check() }, [check])

  return (
    <TooltipProvider>
      {status === 'loading' ? <AppSkeleton /> : status === 'signed-out' ? <AuthScreen /> : <AppShell />}
    </TooltipProvider>
  )
}
