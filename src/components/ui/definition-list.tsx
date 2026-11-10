// Label/value rows: every "explain my price" and breakdown uses this.
//   rows: one line per item, label left, value right (money right-aligned, tabular figures)
//   grid: two columns of small facts, label above value (the asset card)
import type { ReactNode } from 'react';
import { cx } from './cx';

export type DefinitionItem = {
  label: ReactNode;
  value: ReactNode;
  /** Right-aligned with tabular figures, for money and numbers. */
  numeric?: boolean;
  /** A total: a rule above it and bold text. */
  total?: boolean;
  /** A short explanation under the label, e.g. "band B, factor 0.027584". */
  hint?: ReactNode;
};

type DefinitionListProps = {
  items: DefinitionItem[];
  variant?: 'rows' | 'grid';
  className?: string;
};

export function DefinitionList({ items, variant = 'rows', className }: DefinitionListProps) {
  if (variant === 'grid') {
    // Two columns once there is room for two dates side by side, each on one line ("5.
    // marraskuuta 2026": 16 rem, so with the reader's larger text it takes a wider box);
    // narrower, one fact under the other.
    return (
      <div className="@container">
        <dl
          className={cx(
            'grid grid-cols-1 gap-x-4 gap-y-3 text-sm @min-[16rem]:grid-cols-2',
            className
          )}
        >
          {items.map((item, index) => (
            <div key={index}>
              <dt className="text-ink-muted">{item.label}</dt>
              <dd className={cx('font-medium', item.numeric && 'tabular-nums')}>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <dl className={cx('divide-y divide-line text-sm sm:text-base', className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cx(
            // A value that does not fit beside its label moves under it, still on the right; one
            // longer than the whole row (an e-mail address with the reader's 200 % text) breaks.
            // The label takes 8 rem or its longest word, whichever is wider (a flex item's own
            // minimum, capped at the row by `max-w-full`), so the value moves before a word of
            // the label would break.
            'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5',
            item.total && 'border-t-2 border-ink font-semibold'
          )}
        >
          <dt className="max-w-full flex-1 basis-32">
            <span className={item.total ? undefined : 'text-ink-muted'}>{item.label}</span>
            {item.hint ? <span className="block text-xs text-ink-muted">{item.hint}</span> : null}
          </dt>
          <dd
            className={cx(
              'ml-auto text-right',
              item.numeric ? 'tabular-nums whitespace-nowrap' : 'min-w-0'
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
