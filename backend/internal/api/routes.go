package api

import (
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"
)

func SetupRouter(h *Handler) http.Handler {
	r := chi.NewRouter()

	// Standard middlewares
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS configuration
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // In production, specify frontend origin
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	})
	r.Use(c.Handler)

	// Serve static files from uploads directory
	uploadsDir := "./uploads"
	if _, err := os.Stat(uploadsDir); os.IsNotExist(err) {
		os.MkdirAll(uploadsDir, os.ModePerm)
	}
	fileServer := http.FileServer(http.Dir(uploadsDir))
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", fileServer))

	// API Routes
	r.Route("/api", func(r chi.Router) {
		// Public Auth routes
		r.Post("/auth/register", h.Register)
		r.Post("/auth/login", h.Login)

		// Authenticated routes
		r.Group(func(r chi.Router) {
			r.Use(AuthMiddleware)

			r.Get("/auth/profile", h.GetProfile)
			r.Get("/categories", h.GetCategories)

			// WebSocket route
			r.Get("/ws", h.Hub.ServeWS)

			// Notifications routes
			r.Get("/notifications", h.GetNotifications)
			r.Put("/notifications/{id}/read", h.MarkNotificationRead)

			// Requests routes
			r.Post("/requests", h.CreateRequest)
			r.Get("/requests", h.GetRequests)
			r.Get("/requests/{id}", h.GetRequestByID)
			r.Put("/requests/{id}", h.UpdateRequest)
			r.Delete("/requests/{id}", h.DeleteRequest)

			// Officer routes
			r.Group(func(r chi.Router) {
				r.Use(RequireRoles("officer"))
				r.Put("/requests/{id}/status", h.UpdateStatus)
			})

			// Admin routes
			r.Group(func(r chi.Router) {
				r.Use(RequireRoles("admin"))
				r.Post("/admin/register", h.Register) // Admin registers officers/admins
				r.Post("/requests/{id}/assign", h.AssignRequest)
				r.Get("/users", h.GetUsers)
				r.Get("/admin/export", h.ExportRequestsCSV)
				r.Get("/admin/export/pdf", h.ExportPDF)
				r.Get("/admin/activity-logs", h.GetActivityLogs)
			})
		})
	})

	return r
}
