import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FilesProvider } from './FilesContext'
import { Shell } from './Shell'
import Drive from './pages/Drive'
import Files from './pages/Files'
import Home from './pages/Home'
import Kb from './pages/Kb'
import { Gallery, NotFound, SearchPage } from './pages/Misc'

// The editor is the heaviest part of the app; load it only when a file is opened.
const EditorScreen = lazy(() => import('./EditorScreen'))

const Loading = () => (
  <div className="grid h-full place-items-center text-sm text-muted" role="status">
    Loading…
  </div>
)

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<Home />} />
        <Route path="files" element={<Files />} />
        <Route path="files/:folderId" element={<Files />} />
        <Route path="kb" element={<Kb />} />
        <Route
          path="kb/:id"
          element={
            <Suspense fallback={<Loading />}>
              <EditorScreen kind="kb" />
            </Suspense>
          }
        />
        <Route
          path="map/:id"
          element={
            <Suspense fallback={<Loading />}>
              <EditorScreen kind="map" />
            </Suspense>
          }
        />
        <Route path="gallery" element={<Gallery />} />
        <Route path="drive" element={<Drive />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <FilesProvider>
        <AppRoutes />
      </FilesProvider>
    </BrowserRouter>
  )
}
