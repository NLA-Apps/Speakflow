const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

const removedAndroidPermissions = new Set([
  'android.permission.CAMERA',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

module.exports = function withAudioOnlyWebRTC(config) {
  config = withInfoPlist(config, (result) => {
    delete result.modResults.NSCameraUsageDescription;
    return result;
  });
  return withAndroidManifest(config, (result) => {
    const permissions = result.modResults.manifest['uses-permission'] ?? [];
    result.modResults.manifest['uses-permission'] = permissions.filter(
      (permission) => !removedAndroidPermissions.has(permission.$?.['android:name']),
    );
    return result;
  });
};
