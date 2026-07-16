package main

import (
	"log"
	"net/http"
	"os"

	"backend/internal/api"
	"backend/internal/database"
)

func main() {
	log.Println("Starting MIVA Maintenance System Backend...")

	// Initialize Database
	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer db.Close()

	// Initialize WebSocket Hub
	hub := api.NewHub()
	go hub.Run()

	// Initialize Handler
	h := api.NewHandler(db, hub)

	// Setup Router
	router := api.SetupRouter(h)

	// Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
