// The browser now calls Watobot directly (community info, invite links,
// sending messages) instead of proxying everything through a Cloud
// Function — Watobot's API allows cross-origin calls from anywhere
// (services/buildServer.js registers @fastify/cors with origin: true).
//
// For local testing against a local Watobot instance, temporarily change
// this to that instance's address (e.g. "https://localhost") — same idea as
// functions/.env.local's WATOBOT_API_BASE override, just don't commit the
// change.
export const WATOBOT_API_BASE = "https://api.watobot.xyz";
