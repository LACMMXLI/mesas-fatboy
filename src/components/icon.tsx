const paths = {
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6L6 18",
  coffee: "M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M12 3v2",
  fork: "M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 21V3c-2 1-3.5 4-3.5 8 0 1.5 1 2 2 2h1.5",
  door: "M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 6 18.5V20M11 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 20v-1a3 3 0 0 0-2-2.8M15.5 5.8a3 3 0 0 1 0 5.4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  skip: "M5 5l9 7-9 7V5zM18 5v14",
  up: "M6 14l6-6 6 6",
  down: "M6 10l6 6 6-6",
  play: "M7 5l12 7-12 7V5z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  stop: "M7 7h10v10H7z",
  list: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 14l2 2 4-4",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  swap: "M7 7h11l-3-3M17 17H6l3 3",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
  bookmark: "M7 4h10v16l-5-4-5 4V4z",
  minus: "M5 12h14",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
