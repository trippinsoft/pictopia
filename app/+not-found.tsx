import { router } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFoundScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center">
            <CardTitle className="text-h2 text-card-foreground">404 – Not found</CardTitle>
            <CardDescription className="text-body text-muted-foreground">
              The page you're looking couldn't be found.
            </CardDescription>
          </CardHeader>
          <CardContent className="items-center">
            <Text className="text-caption text-center text-muted-foreground">
              Your page may have moved or may not exist yet for this version of the app.
            </Text>
          </CardContent>
          <CardFooter className="gap-3">
            <Button onPress={() => router.replace("/")} className="flex-1">
              <Text className="text-button text-primary-foreground">Go to Home</Text>
            </Button>
            <Button variant="outline" onPress={() => router.back()} className="flex-1">
              <Text className="text-button text-foreground">Go Back</Text>
            </Button>
          </CardFooter>
        </Card>
      </View>
    </SafeAreaView>
  );
}
