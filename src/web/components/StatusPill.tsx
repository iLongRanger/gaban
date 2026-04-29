const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  interested: 'bg-green-100 text-green-800',
  rejected: 'bg-gray-100 text-gray-600',
  closed: 'bg-purple-100 text-purple-800',
};

export default function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-medium ' + colors}>
      {status}
    </span>
  );
}
