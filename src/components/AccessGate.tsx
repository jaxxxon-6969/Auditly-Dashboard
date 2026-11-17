import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Building2, Check, Copy, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, LogOut, Mail, Plus, ShieldCheck } from 'lucide-react';
import {
  AuditlyIdentity,
  ClientWorkspaceSummary,
  changeTemporaryPassword,
  createClientWorkspace,
  listClientWorkspaces,
  signInWithPassword,
} from '../services/authService';

type AccessGateProps = {
  mode: 'login' | 'password' | 'workspaces';
  identity?: AuditlyIdentity | null;
  onSignedIn: (identity: AuditlyIdentity) => void;
  onPasswordChanged: (identity: AuditlyIdentity) => void;
  onSelectWorkspace: (client: ClientWorkspaceSummary) => void;
  onSignOut: () => void;
};

const fieldClass = 'w-full rounded-[4px] border-2 border-[#1E293B] bg-[#FDF9F6] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#9A7AF1] focus:shadow-[3px_3px_0px_#9A7AF1]';

export const AccessGate: React.FC<AccessGateProps> = ({
  mode,
  identity,
  onSignedIn,
  onPasswordChanged,
  onSelectWorkspace,
  onSignOut,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clients, setClients] = useState<ClientWorkspaceSummary[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (mode !== 'workspaces') return;
    let cancelled = false;
    listClientWorkspaces()
      .then((items) => { if (!cancelled) setClients(items); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Workspaces could not be loaded.');
      });
    return () => { cancelled = true; };
  }, [mode]);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const nextIdentity = await signInWithPassword(email, password);
      onSignedIn(nextIdentity);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError('Use at least 10 characters for your new password.');
    if (password !== confirmPassword) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await changeTemporaryPassword(password);
      onPasswordChanged(identity as AuditlyIdentity);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateClient = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createClientWorkspace(clientName, clientEmail);
      setClients((previous) => [result.client, ...previous]);
      setClientName('');
      setClientEmail('');
      setTemporaryPassword(result.temporaryPassword);
      setNotice('Save this temporary password now. It will only be shown once.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client workspace could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setNotice('Temporary password copied. Share it with the client through your usual secure channel.');
    } catch {
      setNotice('Copy was unavailable. Select the password and share it through your usual secure channel.');
    }
  };

  if (mode === 'login') {
    return (
      <main className="h-full w-full overflow-y-auto bg-[#F7F3F0] p-4 sm:p-8">
        <div className="mx-auto grid min-h-full w-full max-w-5xl overflow-hidden border-2 border-[#1E293B] bg-white shadow-[8px_8px_0px_#0E0E10] md:min-h-[min(680px,calc(100vh-4rem))] md:grid-cols-[0.92fr_1.08fr]">
          <aside className="relative flex flex-col justify-between overflow-hidden bg-[#0E0E10] p-6 text-white sm:p-9">
            <div className="absolute inset-x-0 top-0 h-2 bg-[#9A7AF1]" />
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-white bg-[#9A7AF1] text-white shadow-[3px_3px_0px_#F7F3F0]">
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-display text-lg font-bold tracking-wide">AUDITLY</div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#B7A3FA]">Payroll contribution audit</div>
                </div>
              </div>

              <div className="mt-10 inline-flex items-center gap-2 border border-white/30 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#D7CBFF]">
                <span className="h-2 w-2 bg-[#10B981]" /> Private access / 01
              </div>
              <h1 className="mt-5 max-w-sm font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl">
                Payroll reviews,<br />kept in order.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[#B9C0CF]">
                Sign in to the secure workspace assigned to your organization and review its contribution results.
              </p>

              <div className="mt-8 grid gap-2.5">
                <div className="flex items-center gap-3 border border-white/20 bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.08]">
                  <span className="font-mono text-xs font-bold text-[#B7A3FA]">01</span>
                  <span className="text-xs font-semibold text-white">Private client workspaces</span>
                  <span className="ml-auto h-2 w-2 bg-[#10B981]" />
                </div>
                <div className="flex items-center gap-3 border border-white/20 bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.08]">
                  <span className="font-mono text-xs font-bold text-[#B7A3FA]">02</span>
                  <span className="text-xs font-semibold text-white">Verified payroll comparisons</span>
                  <ArrowRight className="ml-auto h-4 w-4 text-[#B7A3FA]" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-white/20 pt-4 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">
              <span>Auditly / Access portal</span>
              <span>Secure session</span>
            </div>
          </aside>

          <section className="flex items-center bg-white px-6 py-8 sm:px-10 md:px-12">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-7 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Workspace login</span>
                <span className="inline-flex items-center gap-1.5 border-2 border-[#1E293B] bg-[#ECE6FD] px-2 py-1 text-[10px] font-bold uppercase text-[#5837B8] shadow-[2px_2px_0px_#0E0E10]">
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" /> Protected
                </span>
              </div>

              <h2 className="font-display text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">Welcome back.</h2>
              <p className="mt-2 text-sm leading-6 text-[#64748B]">Enter the email and password linked to your Auditly account.</p>

              <form onSubmit={handleSignIn} className="mt-8 space-y-5">
                <label htmlFor="auditly-login-email" className="block space-y-2 text-xs font-bold text-[#0F172A]">
                  Email address
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" aria-hidden="true" />
                    <input
                      id="auditly-login-email"
                      className={`${fieldClass} h-12 pl-10`}
                      type="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      required
                    />
                  </span>
                </label>

                <div className="space-y-2">
                  <label htmlFor="auditly-login-password" className="block text-xs font-bold text-[#0F172A]">Password</label>
                  <span className="relative block">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" aria-hidden="true" />
                    <input
                      id="auditly-login-password"
                      className={`${fieldClass} h-12 pl-10 pr-12`}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center border border-transparent text-[#64748B] transition-colors hover:border-[#1E293B] hover:bg-[#ECE6FD] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7AF1]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </span>
                </div>

                {error && (
                  <div role="alert" aria-live="polite" className="flex gap-3 border-2 border-[#F59E0B] bg-[#FFF7E6] p-3 text-sm text-[#7C3E00] shadow-[3px_3px_0px_#1E293B]">
                    <span className="mt-0.5 h-4 w-1 shrink-0 bg-[#F59E0B]" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                  className="group flex h-12 w-full items-center justify-center gap-2 border-2 border-[#1E293B] bg-[#9A7AF1] px-4 text-sm font-bold text-white shadow-[4px_4px_0px_#0E0E10] transition-all hover:-translate-y-0.5 hover:bg-[#8967E5] hover:shadow-[5px_5px_0px_#0E0E10] active:translate-y-0.5 active:shadow-[1px_1px_0px_#0E0E10] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {busy ? 'Signing in...' : 'Sign in to workspace'}
                  {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
                </button>
              </form>

              <div className="mt-7 flex items-start gap-2 border-t border-[#E2DCD5] pt-4 text-xs leading-5 text-[#64748B]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CE0]" aria-hidden="true" />
                <p>Access is limited to authorized users. Each client can view only their assigned workspace.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-[#F7F3F0] p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-5xl border-2 border-[#1E293B] bg-white shadow-[7px_7px_0px_#0E0E10]">
        <div className="flex flex-col gap-8 p-6 sm:p-9 md:flex-row md:items-stretch">
          <section className="md:w-[38%] md:border-r-2 md:border-[#E2DCD5] md:pr-8">
            <div className="inline-flex h-12 w-12 items-center justify-center border-2 border-[#1E293B] bg-[#ECE6FD] shadow-[3px_3px_0px_#0E0E10]">
              <ShieldCheck className="h-6 w-6 text-[#7C5CE0]" />
            </div>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7C5CE0]">Private payroll workspaces</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A]">AUDITLY</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#64748B]">
              Review contribution results in a secure workspace assigned to your organization.
            </p>
            {identity && (
              <div className="mt-8 border-2 border-[#E2DCD5] bg-[#FDF9F6] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">Signed in as</div>
                <div className="mt-1 break-all text-sm font-bold text-[#0F172A]">{identity.email}</div>
                <button onClick={onSignOut} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#64748B] hover:text-[#0F172A]">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            )}
          </section>

          <section className="min-w-0 flex-1">
            {mode === 'password' && (
              <form onSubmit={handlePasswordChange} className="mx-auto max-w-md space-y-4 py-1">
                <div>
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center border-2 border-[#1E293B] bg-[#FFF7E6]"><KeyRound className="h-4 w-4 text-[#C25A00]" /></div>
                  <h2 className="text-xl font-bold text-[#0F172A]">Set a new password</h2>
                  <p className="mt-1 text-sm text-[#64748B]">Choose a private password before opening your dashboard.</p>
                </div>
                <label className="block space-y-1.5 text-xs font-bold text-[#0F172A]">New password
                  <input className={fieldClass} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
                </label>
                <label className="block space-y-1.5 text-xs font-bold text-[#0F172A]">Confirm new password
                  <input className={fieldClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={10} />
                </label>
                {error && <p role="alert" className="border-l-4 border-[#F59E0B] bg-[#FFF7E6] px-3 py-2 text-sm text-[#7C3E00]">{error}</p>}
                <button disabled={busy} className="w-full border-2 border-[#1E293B] bg-[#9A7AF1] px-4 py-2.5 text-sm font-bold text-white shadow-[3px_3px_0px_#0E0E10] disabled:opacity-60">{busy ? 'Updating…' : 'Save password'}</button>
              </form>
            )}

            {mode === 'workspaces' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-[#0F172A]">Choose a client workspace</h2>
                  <p className="mt-1 text-sm text-[#64748B]">Each client only sees the data saved in their own workspace.</p>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-2.5">
                    {clients.length === 0 ? (
                      <div className="border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-5 text-sm text-[#64748B]">No client workspaces yet. Create the first login to get started.</div>
                    ) : clients.map((client) => (
                      <div key={client.id} className="flex items-center justify-between gap-3 border-2 border-[#1E293B] bg-[#FDF9F6] p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#0F172A]">{client.name}</div>
                          <div className="truncate text-xs text-[#64748B]">{client.email}</div>
                        </div>
                        <button onClick={() => onSelectWorkspace(client)} className="shrink-0 inline-flex items-center gap-1.5 border-2 border-[#1E293B] bg-white px-2.5 py-1.5 text-xs font-bold shadow-[2px_2px_0px_#0E0E10] hover:bg-[#ECE6FD]">
                          Open <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleCreateClient} className="space-y-3 border-2 border-[#E2DCD5] bg-[#F8F6F4] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A]"><Plus className="h-4 w-4 text-[#7C5CE0]" /> Create client login</div>
                    <label className="block space-y-1 text-[11px] font-bold text-[#0F172A]">Company or client name
                      <input className={fieldClass} value={clientName} onChange={(event) => setClientName(event.target.value)} required minLength={2} />
                    </label>
                    <label className="block space-y-1 text-[11px] font-bold text-[#0F172A]">Client email
                      <input className={fieldClass} type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} required />
                    </label>
                    <button disabled={busy} className="flex w-full items-center justify-center gap-2 border-2 border-[#1E293B] bg-[#9A7AF1] px-3 py-2 text-xs font-bold text-white shadow-[3px_3px_0px_#0E0E10] disabled:opacity-60">
                      <Building2 className="h-4 w-4" /> {busy ? 'Creating…' : 'Create private workspace'}
                    </button>
                  </form>
                </div>

                {temporaryPassword && (
                  <div className="border-2 border-[#10B981] bg-[#ECFDF5] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#065F46]"><Check className="h-4 w-4" /> Client login created</div>
                    <p className="mt-1 text-xs text-[#35685A]">{notice}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <code className="select-all rounded border border-[#A7DCCB] bg-white px-3 py-2 text-sm font-bold tracking-wide">{temporaryPassword}</code>
                      <button onClick={copyTemporaryPassword} className="inline-flex items-center gap-1.5 border-2 border-[#1E293B] bg-white px-2.5 py-2 text-xs font-bold"><Copy className="h-3.5 w-3.5" /> Copy</button>
                    </div>
                  </div>
                )}
                {notice && !temporaryPassword && <p role="status" className="text-xs text-[#35685A]">{notice}</p>}
                {error && <p role="alert" className="border-l-4 border-[#F59E0B] bg-[#FFF7E6] px-3 py-2 text-sm text-[#7C3E00]">{error}</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
