import { useState } from 'react';
import { exerciseById } from './exercises';
import { Home } from './ui/Home';
import { MixedPractice } from './ui/Mixed';
import { Practice } from './ui/Practice';
import { SettingsPage } from './ui/Settings';
import { StatsPage } from './ui/Stats';
import { useStore } from './ui/useStore';

type Route =
  | { page: 'home' }
  | { page: 'practice'; id: string; focus?: string[] }
  | { page: 'mix'; round: number }
  | { page: 'stats' }
  | { page: 'settings' };

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
          onMix={() => setRoute({ page: 'mix', round: 0 })}
          onStats={() => setRoute({ page: 'stats' })}
          onSettings={() => setRoute({ page: 'settings' })}
        />
      )}
      {route.page === 'practice' && (
        <Practice
          key={`${route.id}:${route.focus?.join(',') ?? ''}`}
          ex={exerciseById[route.id]}
          focus={route.focus}
          store={store}
          update={update}
          onBack={home}
        />
      )}
      {route.page === 'mix' && (
        <MixedPractice
          key={route.round}
          store={store}
          update={update}
          onBack={home}
          onAgain={() => setRoute({ page: 'mix', round: route.round + 1 })}
        />
      )}
      {route.page === 'stats' && (
        <StatsPage store={store} onBack={home} onFocus={(id, focus) => setRoute({ page: 'practice', id, focus })} />
      )}
      {route.page === 'settings' && <SettingsPage store={store} update={update} onBack={home} />}
    </div>
  );
}
