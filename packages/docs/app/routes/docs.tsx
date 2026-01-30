import type { Route } from './+types/docs';
import { redirect } from 'react-router';

export function loader({}: Route.LoaderArgs) {
  return redirect('/docs/en');
}
