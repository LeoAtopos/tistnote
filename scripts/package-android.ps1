$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $env:LOCALAPPDATA 'TistnoteBuild'
if (!$env:JAVA_HOME) { $env:JAVA_HOME = (Get-ChildItem -LiteralPath (Join-Path $tools 'java') -Directory | Select-Object -First 1).FullName }
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $tools 'sdk' }
if (!$env:GRADLE_HOME) { $env:GRADLE_HOME = Join-Path $tools 'gradle-8.11.1' }
$gradle = Join-Path $env:GRADLE_HOME 'bin/gradle.bat'
$keytool = Join-Path $env:JAVA_HOME 'bin/keytool.exe'
if (!(Test-Path -LiteralPath $gradle) -or !(Test-Path -LiteralPath $keytool) -or !(Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platforms/android-35/android.jar'))) { throw 'Install JDK 17+, Gradle 8.11.1, and Android SDK platform/build-tools 35; set JAVA_HOME, GRADLE_HOME, ANDROID_HOME.' }
$signingDir = Join-Path $tools 'signing'
if (!(Test-Path -LiteralPath $signingDir)) {
    New-Item -ItemType Directory -Path $signingDir | Out-Null
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($owner)
    foreach ($identity in @($owner,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $signingDir -AclObject $acl
}
$credentials = Join-Path $signingDir 'signing.json'
if (!(Test-Path -LiteralPath $credentials)) {
    $keystore = Join-Path $signingDir 'release.jks'
    if (Test-Path -LiteralPath $keystore) { throw 'Existing signing key has no credential file; restore its credentials instead of generating a replacement.' }
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    @{keystore=$keystore;storePassword=$password;keyPassword=$password} | ConvertTo-Json | Set-Content -LiteralPath $credentials -Encoding utf8NoBOM
    $env:TISTNOTE_ANDROID_STORE_PASSWORD = $password
    $env:TISTNOTE_ANDROID_KEY_PASSWORD = $password
    & $keytool -genkeypair -keystore $keystore -storepass:env TISTNOTE_ANDROID_STORE_PASSWORD -keypass:env TISTNOTE_ANDROID_KEY_PASSWORD -alias tistnote -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Tistnote, O=LeoAtopos'
    if ($LASTEXITCODE) { throw 'Signing key generation failed; inspect the private signing folder.' }
}
$signing = Get-Content -LiteralPath $credentials -Raw | ConvertFrom-Json
if (!(Test-Path -LiteralPath $signing.keystore)) { throw 'Signing key is missing. Restore it to preserve compatibility with installed APKs.' }
$env:TISTNOTE_ANDROID_KEYSTORE = $signing.keystore
$env:TISTNOTE_ANDROID_STORE_PASSWORD = $signing.storePassword
$env:TISTNOTE_ANDROID_KEY_PASSWORD = $signing.keyPassword
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
if ($env:HTTPS_PROXY) {
    $proxy = [uri]$env:HTTPS_PROXY
    $env:GRADLE_OPTS += " -Dhttps.proxyHost=$($proxy.Host) -Dhttps.proxyPort=$($proxy.Port) -Dhttp.proxyHost=$($proxy.Host) -Dhttp.proxyPort=$($proxy.Port)"
}
Push-Location -LiteralPath $workspace
try {
    npm run build:android
    if ($LASTEXITCODE) { throw 'Android frontend build failed' }
    Copy-Item -LiteralPath LICENSE -Destination dist-android/LICENSE -Force
    & $gradle -p android --no-daemon --console=plain testDebugUnitTest lintRelease assembleRelease
    if ($LASTEXITCODE) { throw 'Android tests, lint, or APK build failed' }
    Write-Output (Join-Path $workspace 'android/app/build/outputs/apk/release/app-release.apk')
} finally {
    Pop-Location
    Remove-Item Env:TISTNOTE_ANDROID_KEYSTORE,Env:TISTNOTE_ANDROID_STORE_PASSWORD,Env:TISTNOTE_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
}
