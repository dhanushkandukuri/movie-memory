import { z } from "zod";

// Matches the VARCHAR(100) column on User.favoriteMovie and MovieFact.movieTitle.
export const MOVIE_TITLE_MAX_LENGTH = 100;

// Min length is 1 on purpose: there are real one-character titles ("M", "9").
export const movieTitleSchema = z
  .string({ error: "Please enter a movie title." })
  .trim()
  // "The   Matrix" and "The Matrix" should be the same movie (and the same cache key).
  .overwrite((title) => title.replace(/\s+/g, " "))
  .min(1, "Please enter a movie title.")
  .max(MOVIE_TITLE_MAX_LENGTH, `Keep it to ${MOVIE_TITLE_MAX_LENGTH} characters or fewer.`)
  .regex(/^[^\p{Cc}]*$/u, "That title has characters we can't save.");
