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

# Add any project specific keep options here:

# @generated begin expo-build-properties - expo prebuild (DO NOT MODIFY)
# TensorFlow Lite — delegue GPU absent du classpath.
# react-native-fast-tflite reference GpuDelegateFactory, mais l'artefact GPU n'est pas
# embarque : la reconnaissance d'aliments tourne sur CPU. R8 refuse de compiler sur ces
# references non resolues, alors qu'elles ne sont jamais atteintes a l'execution.
# Regles produites par R8 lui-meme (build/outputs/mapping/release/missing_rules.txt).
-dontwarn org.tensorflow.lite.gpu.GpuDelegateFactory$Options$GpuBackend
-dontwarn org.tensorflow.lite.gpu.GpuDelegateFactory$Options

# Le modele embarque est appele via JSI depuis JavaScript : R8 ne voit aucun appelant
# Java et supprimerait ces classes.
-keep class org.tensorflow.lite.** { *; }
# TensorFlow Lite — delegue GPU absent du classpath.
# react-native-fast-tflite reference GpuDelegateFactory, mais l'artefact GPU n'est pas
# embarque : la reconnaissance d'aliments tourne sur CPU. R8 refuse de compiler sur ces
# references non resolues, alors qu'elles ne sont jamais atteintes a l'execution.
# Regles produites par R8 lui-meme (build/outputs/mapping/release/missing_rules.txt).
-dontwarn org.tensorflow.lite.gpu.GpuDelegateFactory$Options$GpuBackend
-dontwarn org.tensorflow.lite.gpu.GpuDelegateFactory$Options

# Le modele embarque est appele via JSI depuis JavaScript : R8 ne voit aucun appelant
# Java et supprimerait ces classes.
-keep class org.tensorflow.lite.** { *; }
# @generated end expo-build-properties