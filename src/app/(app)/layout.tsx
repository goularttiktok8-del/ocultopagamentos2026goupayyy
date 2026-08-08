import { AppShell } from '@/components/AppShell';

export default function PrivateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
