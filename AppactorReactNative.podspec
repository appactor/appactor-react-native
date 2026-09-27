require 'json'

unless defined?(install_modules_dependencies)
  begin
    require Pod::Executable.execute_command('node', ['-p',
      'require.resolve(
        "react-native/scripts/react_native_pods.rb",
        {paths: [process.argv[1]]},
      )', __dir__]).strip
  rescue
  end
end

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'AppactorReactNative'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.authors      = package['author']

  # AppActorPlugin 0.2 needs iOS 16.
  s.platforms    = { :ios => '16.0' }
  s.source       = { :git => 'https://github.com/appactor/appactor-react-native.git', :tag => "#{s.version}" }

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.resource_bundles = {
    'AppactorReactNative_privacy' => ['ios/PrivacyInfo.xcprivacy']
  }
  s.dependency   'AppActorPlugin', '0.2.1'
  s.swift_version = '5.9'

  if defined?(install_modules_dependencies)
    install_modules_dependencies(s)
  else
    Pod::UI.warn('AppactorReactNative: install_modules_dependencies is unavailable; skipping React Native pod wiring during standalone podspec lint.')
  end
end
