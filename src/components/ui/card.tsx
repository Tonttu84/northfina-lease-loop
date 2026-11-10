// A raised box. `as` picks the element so a card can be an <article> or a <section>.
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'aside';
  /** An <h2> at the top of the card; pass `titleId` to point `aria-labelledby` at it. */
  title?: ReactNode;
  titleId?: string;
  /** False for a card whose content runs to the edges, e.g. a table. */
  padded?: boolean;
  children: ReactNode;
};

export function Card({
  as: Element = 'div',
  title,
  titleId,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Element
      aria-labelledby={title && titleId ? titleId : undefined}
      className={cx(
        'rounded-xl border border-line bg-raised shadow-card',
        // On a screen under 20 rem (a phone with the reader's larger text) the padding gives the
        // text a little more of the little room there is.
        padded && 'p-4 max-[20rem]:p-3 sm:p-6',
        className
      )}
      {...rest}
    >
      {title ? (
        <h2 id={titleId} className={cx('mb-4 text-xl', !padded && 'px-4 pt-4 sm:px-6 sm:pt-6')}>
          {title}
        </h2>
      ) : null}
      {children}
    </Element>
  );
}
