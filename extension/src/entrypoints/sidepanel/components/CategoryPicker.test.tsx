/** @vitest-environment jsdom */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
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
});
