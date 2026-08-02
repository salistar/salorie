# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ─────────────────────────────────────────────────────────────────────────────
# Keeps pour l'activation de R8 (Play Store). Conservateurs : on préserve tout ce qui
# casse fréquemment en RN/Expo sous minification (réflexion, JNI, natif). Un keep ne peut
# que RENDRE R8 plus prudent — jamais casser un build. (Beaucoup sont déjà fournis par les
# libs via leurs proguard consumer rules ; on double par sécurité.)
# ─────────────────────────────────────────────────────────────────────────────
-keepattributes Signature,InnerClasses,EnclosingMethod,*Annotation*,SourceFile,LineNumberTable
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations

# React Native core + JNI + Hermes + SoLoader
-keep,includedescriptorclasses class com.facebook.react.** { *; }
-keep,includedescriptorclasses class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.soloader.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# TurboModules / bridge (méthodes appelées via réflexion depuis JS)
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclassmembers,allowobfuscation class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }

# Expo modules (résolus par nom / réflexion)
-keep class expo.modules.** { *; }
-keep class expo.core.** { *; }
-dontwarn expo.modules.**

# OkHttp / Okio (réseau RN)
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# Firebase / Google Play Services (FCM push + google-services)
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# RevenueCat (abonnements)
-keep class com.revenuecat.purchases.** { *; }
-dontwarn com.revenuecat.purchases.**

# Health Connect
-keep class androidx.health.connect.** { *; }
-dontwarn androidx.health.connect.**

# Kotlin / coroutines
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.**

# Enums (valueOf/values via réflexion), Parcelable, DTO sérialisés
-keepclassmembers enum * { public static **[] values(); public static ** valueOf(java.lang.String); }
-keepclassmembers class * implements android.os.Parcelable { public static final ** CREATOR; }
-keepclassmembers,allowobfuscation class * { @com.google.gson.annotations.SerializedName <fields>; }

# Add any project specific keep options here:

# react-native-fast-tflite : classes GPU delegate NON bundlées (app en CPU) — R8 strict les refuse sinon
-dontwarn org.tensorflow.lite.gpu.**
