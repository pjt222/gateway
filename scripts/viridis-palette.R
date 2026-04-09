library(viridis)

band_names <- c("delta", "theta", "alpha", "beta", "gamma")
bands <- viridis(5, alpha = 1)

cat("== Band Colors ==\n")
for (i in seq_along(bands)) {
  hex6 <- substr(bands[i], 1, 7)
  r <- col2rgb(bands[i])
  cat(sprintf("  %s: hex=%s  rgba=rgba(%d,%d,%d,__)\n",
    band_names[i], hex6, r[1], r[2], r[3]))
}

cat("\n== Phase Colors (4) ==\n")
phases <- viridis(4, alpha = 1)
for (i in seq_along(phases)) {
  hex6 <- substr(phases[i], 1, 7)
  r <- col2rgb(phases[i])
  cat(sprintf("  phase%d: hex=%s  rgba=rgba(%d,%d,%d,__)\n",
    i, hex6, r[1], r[2], r[3]))
}

cat("\n== UI Palette (8) ==\n")
ui <- viridis(8, alpha = 1)
for (i in seq_along(ui)) {
  hex6 <- substr(ui[i], 1, 7)
  cat(sprintf("  viridis-%d: %s\n", i, hex6))
}

cat("\n== Background Dark (inferno, 3) ==\n")
bg <- viridis(6, option = "inferno", alpha = 1)[1:3]
for (i in seq_along(bg)) {
  hex6 <- substr(bg[i], 1, 7)
  cat(sprintf("  bg-%d: %s\n", i, hex6))
}

cat("\n== Magma Accents (warm end, 4) ==\n")
acc <- viridis(8, option = "magma", alpha = 1)[5:8]
for (i in seq_along(acc)) {
  hex6 <- substr(acc[i], 1, 7)
  cat(sprintf("  accent-%d: %s\n", i, hex6))
}
