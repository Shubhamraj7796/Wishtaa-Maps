import { DynamicIcon, type IconName } from 'lucide-react/dynamic'

/** One clipart icon, loaded on demand (the icon library has about 2,000 icons). */
export default function ClipartIcon({ name, size, color }: { name: string; size: number; color?: string }) {
  return <DynamicIcon name={name as IconName} size={size} color={color ?? 'currentColor'} strokeWidth={2} fallback={() => <span style={{ width: size, height: size }} />} />
}
