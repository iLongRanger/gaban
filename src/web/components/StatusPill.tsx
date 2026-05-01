const STATUS_TONE: Record<string, string> = {
  new: 'tag tag--accent',
  contacted: 'tag tag--warn',
  interested: 'tag tag--accent',
  rejected: 'tag tag--mute',
  closed: 'tag',
};

export default function StatusPill({ status }: { status: string }) {
  const cls = STATUS_TONE[status] || 'tag tag--mute';
  return <span className={cls}>{status}</span>;
}
