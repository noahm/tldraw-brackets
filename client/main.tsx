import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { Diagram } from './pages/Diagram'
import { Home } from './pages/Home'
import { ObsView } from './pages/ObsView'

const router = createBrowserRouter([
	{ path: '/', element: <Home /> },
	{ path: '/d/:diagramId', element: <Diagram /> },
	{ path: '/d/:diagramId/edit', element: <Diagram /> },
	{ path: '/d/:diagramId/obs', element: <ObsView /> },
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>
)
