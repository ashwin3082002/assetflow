import type { RequestDetail } from '../../types';
import { formatDateTime, humanize } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';

interface Event {
  label: string;
  at: string;
  detail?: string;
}

/** Events derived from the request's timestamps (no separate history entity in core). */
function timelineEvents(r: RequestDetail): Event[] {
  const by = r.processedBy ? ` by ${r.processedBy.fullName}` : '';
  const events: Event[] = [{ label: 'Requested', at: r.createdAt, detail: `by ${r.requester.fullName}` }];
  if (r.approvedAt) events.push({ label: 'Approved', at: r.approvedAt, detail: `${by.trim()} · unit reserved` });
  if (r.allocatedAt) events.push({ label: 'Allocated', at: r.allocatedAt, detail: 'unit handed over' });
  if (r.returnInitiatedAt) events.push({ label: 'Return initiated', at: r.returnInitiatedAt, detail: 'awaiting IT Staff confirmation' });
  if (r.completedAt) {
    events.push({
      label: 'Completed',
      at: r.completedAt,
      detail: [r.returnCondition ? `returned ${humanize(r.returnCondition).toLowerCase()}` : null, r.returnNotes].filter(Boolean).join(' · ') || undefined,
    });
  }
  if (r.rejectedAt) events.push({ label: 'Rejected', at: r.rejectedAt, detail: `${by.trim()}${r.rejectionReason ? ` · ${r.rejectionReason}` : ''}` });
  if (r.cancelledAt) events.push({ label: 'Cancelled', at: r.cancelledAt, detail: 'by the requester' });
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function RequestTimeline({ request }: { request: RequestDetail }) {
  const events = timelineEvents(request);
  return (
    <ol className="list-group list-group-flush" aria-label="Request timeline">
      {events.map((e, i) => (
        <li key={e.label} className="list-group-item px-0 d-flex gap-3">
          <span className={`badge rounded-pill align-self-start mt-1 ${i === events.length - 1 ? 'bg-primary' : 'bg-secondary'}`} aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <div className="fw-semibold">{e.label}</div>
            <div className="small text-secondary">
              {formatDateTime(e.at)}
              {e.detail && <> · {e.detail}</>}
            </div>
          </div>
        </li>
      ))}
      <li className="list-group-item px-0 small text-secondary">
        Current status: <StatusBadge value={request.status} />
        {request.isOverdue && <span className="badge bg-danger ms-1">Overdue</span>}
      </li>
    </ol>
  );
}
