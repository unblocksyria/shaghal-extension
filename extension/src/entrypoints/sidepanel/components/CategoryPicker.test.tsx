/** @vitest-environment jsdom */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { CategoryPicker } from './CategoryPicker';

const options = [
  { id: 'cat-streaming', name: 'Streaming' },
  { id: 'cat-entertainment', name: 'Entertainment' },
  { id: 'cat-social', name: 'Social' },
  { id: 'cat-video', name: 'Video calls' },
];

/** The picker as the correction form holds it. */
function Picker() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return <CategoryPicker options={options} selected={selected} onChange={setSelected} />;
}

describe('the category picker', () => {
  it('opens on its button, narrows the list as you type, and says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    expect(screen.queryByRole('checkbox')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Select correct categories...' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);

    await user.type(screen.getByPlaceholderText('Search categories...'), 'VID');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Video calls' })).toBeDefined();

    await user.clear(screen.getByPlaceholderText('Search categories...'));
    await user.type(screen.getByPlaceholderText('Search categories...'), 'xyz');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('No categories found.')).toBeDefined();
  });

  it('ticks and unticks, and sums up the choice on its button, three names at most', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.click(screen.getByRole('button', { name: 'Select correct categories...' }));

    await user.click(screen.getByRole('checkbox', { name: 'Social' }));
    await user.click(screen.getByRole('checkbox', { name: 'Streaming' }));
    // Named in the catalogue's order, not the order they were ticked.
    expect(screen.getByRole('button', { name: '2 selected: Streaming, Social' })).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: 'Entertainment' }));
    await user.click(screen.getByRole('checkbox', { name: 'Video calls' }));
    expect(screen.getByRole('button', { name: '4 selected: Streaming, Entertainment, Social…' })).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: 'Streaming' }));
    expect(screen.getByRole('checkbox', { name: 'Streaming' })).toHaveProperty('checked', false);
    expect(screen.getByRole('button', { name: '3 selected: Entertainment, Social, Video calls' })).toBeDefined();
  });

  it('says whether the list is open and which element it is, with the list after its toggle', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const toggle = screen.getByRole('button', { name: 'Select correct categories...' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('group', { name: 'Categories' });
    expect(toggle.getAttribute('aria-controls')).toBe(list.id);
    // After the toggle in the page, so Tab reaches the button that opened it first.
    expect(toggle.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search categories' })).toBe(document.activeElement);
  });

  it('closes on Escape and gives focus back to its toggle', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const toggle = screen.getByRole('button', { name: 'Select correct categories...' });
    await user.click(toggle);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('closes on a click outside, and when focus moves past it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Picker />
        <button type="button">Elsewhere</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Select correct categories...' }));
    await user.click(document.body);
    expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Select correct categories...' }));
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus());
    expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull();
  });
});
