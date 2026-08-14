#!/bin/bash
# Post-install script for Hyro Music on Linux

# Update desktop database
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Update GTK icon cache so the app menu and desktop environment display the icon immediately
if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

if hash xdg-icon-resource 2>/dev/null; then
    xdg-icon-resource forceupdate || true
fi
