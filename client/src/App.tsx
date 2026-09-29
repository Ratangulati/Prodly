import AppShell from '@/components/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function App() {
  return (
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  )
}
