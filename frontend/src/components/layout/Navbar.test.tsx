import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Navbar } from './Navbar';
import { AuthContext } from '../../auth/AuthContext';
import { UserRole } from '../../types';
import { makeAuth, makeUser } from '../../test/helpers';

/** The navbar is mounted outside any <Routes> so it stays rendered after a link navigates. */
function renderNavbar(role: UserRole) {
  return render(
    <AuthContext.Provider value={makeAuth({ user: makeUser({ role, fullName: 'Ava Admin' }) })}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('Navbar', () => {
  it('renders role-specific links and collapses on small screens via the toggler', async () => {
    renderNavbar(UserRole.ADMIN);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(screen.queryByRole('link', { name: 'My requests' })).not.toBeInTheDocument();

    const toggler = screen.getByRole('button', { name: 'Toggle navigation' });
    const menu = document.getElementById('main-nav')!;
    expect(toggler).toHaveAttribute('aria-expanded', 'false');
    expect(menu).not.toHaveClass('show');

    await userEvent.click(toggler);
    expect(toggler).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveClass('show');

    // Choosing a destination closes the menu again.
    await userEvent.click(screen.getByRole('link', { name: 'Assets' }));
    expect(menu).not.toHaveClass('show');
  });

  it('shows employee links for employees', () => {
    renderNavbar(UserRole.EMPLOYEE);
    expect(screen.getByRole('link', { name: 'My requests' })).toHaveAttribute('href', '/employee/requests');
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });
});
