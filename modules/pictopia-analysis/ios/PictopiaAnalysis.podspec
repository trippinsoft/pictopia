Pod::Spec.new do |s|
  s.name = 'PictopiaAnalysis'
  s.version = '1.0.0'
  s.summary = 'Private on-device streaming hashes and thumbnail quality analysis'
  s.description = 'Local Pictopia analysis module, with no networking.'
  s.license = { :type => 'MIT' }
  s.author = 'Pictopia'
  s.homepage = 'https://expo.dev'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
