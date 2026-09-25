import Link from 'next/link';
import { INVESTIGATIONS } from '@/lib/classroom/investigations';
import { PageHeader, Notice } from '@/components/ui';

export const metadata = { title: 'Classroom investigations' };

export default function Classroom() {
  return (
    <div>
      <PageHeader
        title="Classroom investigations"
        lead="Short, evidence-backed activities built on real observations. Learners predict, reveal the withheld historical data, and explain which evidence changed their answer. Each activity has a printable teacher pack with an answer key that cites its calculations."
      />
      <Notice>
        Questions are written by the project team, and answers are computed from the data. No alignment with a specific school curriculum is claimed, and
        the activities have not been reviewed by an external educator.
      </Notice>
      <ul className="grid gap-4 sm:grid-cols-3 mt-4">
        {INVESTIGATIONS.map((i) => (
          <li key={i.slug} className="card p-4 flex flex-col gap-2">
            <Link href={`/classroom/${i.slug}`} className="font-semibold">
              {i.title}
            </Link>
            <p className="text-sm muted">{i.summary}</p>
            <p className="text-xs muted mt-auto">{i.level}</p>
            <Link href={`/classroom/${i.slug}/teacher`} className="text-sm">
              Teacher pack (printable)
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
