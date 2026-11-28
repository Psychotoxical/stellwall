import SwiftUI
import UIKit
import VisionKit

/** Apple's document scanner for recipe pages: straightened pages as JPEG, at most four, at most 2000 px a side. */
struct RecipeScanner: UIViewControllerRepresentable {
    let done: ([Data]?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: ([Data]?) -> Void
        init(done: @escaping ([Data]?) -> Void) { self.done = done }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let pages = (0..<min(scan.pageCount, 4)).compactMap { RecipeScanner.jpeg(scan.imageOfPage(at: $0)) }
            done(pages.isEmpty ? nil : pages)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done(nil) }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done(nil) }
    }

    /** Small enough to send quickly, sharp enough for Mealie's AI to read. */
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 2000) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return small.jpegData(compressionQuality: 0.85)
    }
}
