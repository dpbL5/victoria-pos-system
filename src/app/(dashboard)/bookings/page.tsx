import { BookingsScreen } from '@/features/bookings/bookings-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function BookingsPage() {
  await requirePageAccess('bookings')

  return <BookingsScreen />
}
