# Roadmap React Native / Android TV

## Objectif
Produire un APK natif pour Android TV capable de recevoir
les traits en temps réel depuis un smartphone.

## Stack cible
- React Native + Expo
- Supabase Realtime (même logique que la version web)
- react-native-canvas ou Skia pour le rendu

## Architecture prévue
- Même logique de normalisation (x%, y%)
- Même système de sessionId
- Même broadcast Supabase
- Rendu natif via react-native-skia (60fps garanti)

## Avantages vs navigateur
- Meilleure gestion RAM sur Android TV
- Accès au GPU natif
- Pas de limitations du navigateur (passive events, etc.)
- Installation via APK sans store

## Étapes
1. Init projet Expo
   expo init iwaju-board-native
2. Installer Supabase
   npm install @supabase/supabase-js
3. Installer Skia
   npm install @shopify/react-native-skia
4. Porter la logique de App.jsx vers React Native
5. Build APK Android TV
   eas build --platform android

## Status
🔄 En cours de planification