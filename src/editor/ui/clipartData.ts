/** Curated clipart categories. Every name is an icon from the open-source (ISC) Lucide set. */
export const CLIPART_CATEGORIES: Record<string, string[]> = {
  Business: ['briefcase', 'building-2', 'chart-bar', 'chart-line', 'chart-pie', 'wallet', 'credit-card', 'banknote', 'calculator', 'handshake', 'receipt', 'landmark', 'piggy-bank', 'coins', 'trending-up', 'trending-down', 'target', 'presentation', 'clipboard-list', 'scale'],
  People: ['user', 'users', 'user-round', 'contact', 'baby', 'graduation-cap', 'accessibility', 'hand-heart', 'smile', 'laugh', 'frown', 'heart-handshake', 'crown', 'medal', 'award', 'hand-metal'],
  Communication: ['mail', 'message-circle', 'message-square', 'phone', 'megaphone', 'bell', 'send', 'at-sign', 'share-2', 'rss', 'video', 'mic', 'headphones', 'podcast'],
  Technology: ['laptop', 'smartphone', 'monitor', 'server', 'database', 'cloud', 'wifi', 'cpu', 'code', 'terminal', 'bug', 'git-branch', 'globe', 'qr-code', 'bluetooth', 'battery-full', 'plug', 'usb'],
  Nature: ['sun', 'moon', 'cloud-rain', 'snowflake', 'flame', 'droplet', 'leaf', 'tree-pine', 'flower-2', 'mountain', 'waves', 'wind', 'rainbow', 'sprout', 'bird', 'zap'],
  Animals: ['cat', 'dog', 'bird', 'fish', 'rabbit', 'squirrel', 'turtle', 'bug', 'snail', 'rat', 'worm', 'egg'],
  Education: ['book', 'book-open', 'library', 'pencil', 'pen-tool', 'notebook', 'school', 'microscope', 'flask-conical', 'atom', 'brain', 'lightbulb', 'languages', 'ruler', 'graduation-cap', 'puzzle'],
  Food: ['apple', 'banana', 'cherry', 'coffee', 'cookie', 'pizza', 'utensils', 'wine', 'beer', 'cake', 'carrot', 'ice-cream-cone', 'sandwich', 'soup', 'salad', 'croissant'],
  Travel: ['plane', 'car', 'bus', 'train-front', 'bike', 'ship', 'map', 'map-pin', 'compass', 'tent', 'luggage', 'hotel', 'anchor', 'fuel', 'ticket', 'navigation'],
  Arrows: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'arrow-big-up', 'arrow-big-right', 'move', 'refresh-cw', 'rotate-ccw', 'repeat', 'undo-2', 'redo-2', 'corner-down-right', 'chevrons-right', 'arrow-up-right', 'arrow-left-right'],
  Status: ['circle-check', 'circle-x', 'circle-alert', 'circle-help', 'triangle-alert', 'info', 'star', 'heart', 'flag', 'bookmark', 'lock', 'unlock', 'key', 'shield', 'sparkles', 'thumbs-up'],
  'Time and files': ['calendar', 'calendar-days', 'clock', 'timer', 'alarm-clock', 'hourglass', 'file-text', 'folder', 'folder-open', 'clipboard', 'paperclip', 'archive', 'inbox', 'trash-2', 'printer', 'save'],
}

export const CLIPART_COLORS = ['#1f2937', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777']

/** Names containing every word typed, shortest first. */
export function searchIconNames(all: readonly string[], query: string, limit = 120): string[] {
  const words = query.toLowerCase().split(/[\s-]+/).filter(Boolean)
  if (!words.length) return []
  return all
    .filter((n) => words.every((w) => n.includes(w)))
    .sort((a, b) => a.length - b.length || (a < b ? -1 : 1))
    .slice(0, limit)
}
