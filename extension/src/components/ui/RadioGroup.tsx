import type { HTMLAttributes, KeyboardEvent } from 'react';

/** Arrow keys move and select within a radio group, as native radio inputs do. */
export function RadioGroup(props: HTMLAttributes<HTMLDivElement>) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].filter(
      (button) => !button.matches(':disabled'),
    );
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || buttons.length === 0) return;
    event.preventDefault();
    // A mirrored row runs the buttons the other way, so a horizontal step points the
    // opposite way too: under rtl ArrowLeft steps on to the next button in the DOM.
    // Up and down keep their meaning in both directions, and so do Home and End.
    const rtl = (event.currentTarget.closest('[dir]')?.getAttribute('dir') ?? document.documentElement.dir) === 'rtl';
    const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const step = horizontal === 0 ? (event.key === 'ArrowUp' ? -1 : 1) : rtl ? -horizontal : horizontal;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  return <div {...props} role="radiogroup" onKeyDown={move} />;
}
