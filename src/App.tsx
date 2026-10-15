import { useState } from 'react';
import { exerciseById } from './exercises';
import { Home } from './ui/Home';
import { Practice } from './ui/Practice';
import { SettingsPage } from './ui/Settings';
import { StatsPage } from './ui/Stats';
import { useStore } from './ui/useStore';

type Route = { page: 'home' } | { page: 'practice'; id: string } | { page: 'stats' } | { page: 'settings' };

export default function App() {
  const [store, update] = useStore();
  const [route, setRoute] = useState<Route>({ page: 'home' });
  const home = () => setRoute({ page: 'home' });

  return (
    <div className="app">
      {route.page === 'home' && (
        <Home
          store={store}
          onOpen={(id) => setRoute({ page: 'practice', id })}
          onStats={() => setRoute({ page: 'stats' })}
          onSettings={() => setRoute({ page: 'settings' })}
        />
      )}
      {route.page === 'practice' && (
        <Practice key={route.id} ex={exerciseById[route.id]} store={store} update={update} onBack={home} />
      )}
      {route.page === 'stats' && <StatsPage store={store} onBack={home} />}
      {route.page === 'settings' && <SettingsPage store={store} update={update} onBack={home} />}
    </div>
  );
}
